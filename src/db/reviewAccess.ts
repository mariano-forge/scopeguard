// What a client review link gives access to. The client has no account: the link token is the key,
// and it only opens the deliverable version it was created for.
//
// Reading: that version, its comments and their proposals; nothing about other clients or projects.
// Writing: what the client page can do, checked here rather than trusted:
//   - comments: add its own remarks, edit/move/delete them, reply in any thread of this version;
//     never change the agency's messages or a qualification (decision, title, quote…);
//   - proposals: accept or refuse a sent proposal once, or ask for an adaptation;
//   - the version: request changes or approve it, never undo an approval;
//   - audit events and notifications: add new ones, signed with the verified address.
// What the client writes is signed with that address, whatever name the page sends.
// Nothing can be written once the version is approved or replaced.

import { eq, inArray } from "drizzle-orm";
import { sameValue, type ListChange, type MapChange, type SharedState, type StateChanges } from "@/lib/sharedState";
import type { Db } from "./client";
import { commentProposals, comments, deliverables, notifications, proposalVersions, reviewLinks } from "./schema";
import { readState } from "./state";

type Data = Record<string, unknown>;
type Reply = { id?: unknown; initials?: unknown } & Data;

const clientInitials = "CM";
const same = (left: unknown, right: unknown) => sameValue(left ?? null, right ?? null);
const isObject = (value: unknown): value is Data => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const shortText = (value: unknown, max: number) => (typeof value === "string" ? value.slice(0, max) : undefined);

export type ReviewAccess = { key: string; link: Data; deliverableId: number; version: number };

/** "31/12/2026" -> end of that day; an unreadable date counts as expired. */
function expired(link: Data) {
  if (link.autoExpire === false || typeof link.expiresAt !== "string") return false;
  const [day, month, year] = link.expiresAt.split("/").map(Number);
  if (!day || !month || !year) return true;
  return new Date(year, month - 1, day, 23, 59, 59).getTime() < Date.now();
}

/** The link behind a token, if it is active and not expired. */
export async function findReviewAccess(db: Db, token: string): Promise<ReviewAccess | null> {
  if (!token || token.length > 200) return null;
  const [row] = await db.select().from(reviewLinks).where(eq(reviewLinks.token, token)).limit(1);
  if (!row || !row.active || row.deliverableId === null || row.version === null) return null;
  const link = row.data as Data;
  if (link.active !== true || expired(link)) return null;
  return { key: row.key, link, deliverableId: row.deliverableId, version: row.version };
}

/** The part of the shared state the client page needs, in the same shape. */
export async function readReviewState(db: Db, access: ReviewAccess) {
  const { revision, state } = await readState(db);
  if (!state) return { revision, state: null };

  const record = state.deliverables?.find((item) => item.id === access.deliverableId && item.version === access.version);
  const project = state.projects?.find((item) => item.id === ((record?.projectId as number | undefined) ?? 1));
  const client = state.clients?.find((item) => item.id === ((project?.clientId as number | undefined) ?? 1));
  const versionComments = (state.comments ?? []).filter((comment) => comment.deliverableId === access.deliverableId);
  const ids = new Set(versionComments.map((comment) => String(comment.id)));
  const only = (map: Record<string, unknown> | undefined) => Object.fromEntries(Object.entries(map ?? {}).filter(([key]) => ids.has(key)));

  const filtered: SharedState = {
    clients: client ? [{ id: client.id, name: client.name }] : [],
    projects: project ? [{ id: project.id, name: project.name, clientId: project.clientId }] : [],
    deliverables: record ? [record] : [],
    comments: versionComments,
    notifications: [],
    auditEvents: [],
    reviewLinks: { [access.key]: access.link },
    proposalStates: only(state.proposalStates),
    proposalDecisions: only(state.proposalDecisions),
    adaptationRequests: only(state.adaptationRequests),
    proposalVersions: only(state.proposalVersions),
    reviewLink: null,
  };
  return { revision, state: filtered };
}

/** Replies of `before` kept as they were, except the client's own, which may change or go. */
function repliesAllowed(before: Reply[], after: Reply[]) {
  const afterById = new Map(after.map((reply) => [reply.id, reply]));
  for (const reply of before)
    if (reply.initials !== clientInitials && !same(afterById.get(reply.id), reply)) return false;
  const known = new Set(before.map((reply) => reply.id));
  return after.every((reply) => known.has(reply.id) || reply.initials === clientInitials);
}

const qualificationFields = ["id", "deliverableId", "author", "initials", "decision", "kind", "title", "description", "sourceId", "createdAt"];
const placementFields = ["message", "edited", "location", "page", "position", "area"];

function commentAllowed(before: Data | undefined, after: Data, deliverableId: number) {
  if (after.deliverableId !== deliverableId) return false;
  const replies = (value: unknown) => (Array.isArray(value) ? (value as Reply[]) : []);
  if (!before)
    return (
      after.initials === clientInitials &&
      after.decision === "À qualifier" &&
      (after.kind ?? "remark") === "remark" &&
      after.title === undefined &&
      after.description === undefined &&
      replies(after.replies).every((reply) => reply.initials === clientInitials)
    );
  if (qualificationFields.some((field) => !same(before[field], after[field]))) return false;
  if (before.initials !== clientInitials && placementFields.some((field) => !same(before[field], after[field]))) return false;
  const known = new Set([...qualificationFields, ...placementFields, "replies", "time"]);
  if ([...Object.keys(before), ...Object.keys(after)].some((field) => !known.has(field) && !same(before[field], after[field]))) return false;
  return repliesAllowed(replies(before.replies), replies(after.replies));
}

/** Keeps only what the client may write (see the header); everything else is dropped. */
export async function sanitizeReviewChanges(db: Db, access: ReviewAccess, changes: StateChanges, email: string): Promise<StateChanges | null> {
  const [record] = await db.select().from(deliverables).where(eq(deliverables.id, access.deliverableId)).limit(1);
  if (!record || record.version !== access.version) return null;
  const recordData = record.data as Data;
  if (record.reviewStatus === "approved" || record.locked || recordData.status === "Approuvée" || recordData.status === "Remplacée") return null;

  const existing = await db.select().from(comments).where(eq(comments.deliverableId, access.deliverableId));
  const before = new Map(existing.map((row) => [row.id, row.data as Data]));
  const lists: StateChanges["lists"] = {};
  const maps: StateChanges["maps"] = {};

  // Comments of this version only; ids used by another version are refused too.
  const incoming = changes.lists?.comments;
  if (incoming) {
    const candidates = (incoming.upsert ?? []).filter(isObject) as ListChange["upsert"];
    const taken = candidates.length
      ? new Set(
          (await db.select({ id: comments.id }).from(comments).where(inArray(comments.id, candidates.map((comment) => comment.id))))
            .map((row) => row.id)
            .filter((id) => !before.has(id)),
        )
      : new Set<number>();
    const upsert = candidates
      .filter((comment) => !taken.has(comment.id) && commentAllowed(before.get(comment.id), comment, access.deliverableId))
      .map((comment) => {
        // New remarks and replies of the client carry the verified address as author.
        const previous = before.get(comment.id);
        const known = new Set((Array.isArray(previous?.replies) ? (previous.replies as Reply[]) : []).map((reply) => reply.id));
        const replies = Array.isArray(comment.replies)
          ? (comment.replies as Reply[]).map((reply) => (known.has(reply.id) ? reply : { ...reply, author: email }))
          : comment.replies;
        return { ...comment, ...(previous ? {} : { author: email }), ...(replies ? { replies } : {}) };
      });
    const remove = (incoming.remove ?? []).filter((id) => {
      const comment = before.get(id);
      return comment?.initials === clientInitials && comment.decision === "À qualifier";
    });
    if (upsert.length || remove.length) lists.comments = { upsert, remove };
  }

  // Proposals: only on this version's comments, and only once one was sent.
  const commentIds = [...before.keys()];
  const proposals = commentIds.length ? await db.select().from(commentProposals).where(inArray(commentProposals.commentId, commentIds)) : [];
  const proposalOf = new Map(proposals.map((row) => [row.commentId, row]));
  const sent = (key: string) => proposalOf.get(Number(key))?.state === "sent";
  const undecided = (key: string) => [undefined, null, "none"].includes(proposalOf.get(Number(key))?.decision as string | undefined);

  const decisions = changes.maps?.proposalDecisions;
  const decided: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(decisions?.upsert ?? {}))
    if (sent(key) && undecided(key) && (value === "accepted" || value === "refused")) decided[key] = value;
  if (Object.keys(decided).length) maps.proposalDecisions = { upsert: decided, remove: [] };

  // Quote history: the sent quote takes the decision; nothing else in it changes.
  const versions = changes.maps?.proposalVersions;
  const decidedIds = Object.keys(decided).map(Number);
  if (versions && decidedIds.length) {
    const stored = await db.select().from(proposalVersions).where(inArray(proposalVersions.commentId, decidedIds));
    const upsert: MapChange["upsert"] = {};
    for (const key of Object.keys(decided)) {
      const list = stored
        .filter((row) => row.commentId === Number(key))
        .sort((left, right) => left.position - right.position)
        .map((row) => row.data as Data);
      if (list.length) upsert[key] = list.map((quote) => (quote.status === "sent" ? { ...quote, status: decided[key] } : quote));
    }
    if (Object.keys(upsert).length) maps.proposalVersions = { upsert, remove: [] };
  }

  const adaptations = changes.maps?.adaptationRequests;
  const asked: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(adaptations?.upsert ?? {})) {
    if (!sent(key) || !undecided(key) || !isObject(value)) continue;
    const message = shortText(value.message, 5000)?.trim();
    if (!message) continue;
    const amount = (field: unknown) => (typeof field === "number" && Number.isFinite(field) && field >= 0 ? field : undefined);
    asked[key] = { message, budget: amount(value.budget), deadline: amount(value.deadline), requestedAt: shortText(value.requestedAt, 40) ?? "" };
  }
  if (Object.keys(asked).length) maps.adaptationRequests = { upsert: asked, remove: [] };

  // The version: request changes or approve.
  const version = changes.lists?.deliverables?.upsert?.find((item) => item.id === access.deliverableId);
  if (version && (version.reviewStatus === "changes-requested" || version.reviewStatus === "approved")) {
    const approved = version.reviewStatus === "approved";
    const next: Data = { ...recordData, reviewStatus: version.reviewStatus };
    if (approved) Object.assign(next, { status: "Approuvée", locked: true, approvedAt: shortText(version.approvedAt, 40) ?? new Date().toLocaleString("fr-FR") });
    lists.deliverables = { upsert: [next as ListChange["upsert"][number]], remove: [] };
  }

  // New audit events and notifications only, signed by the client.
  const events = (changes.lists?.auditEvents?.upsert ?? []).filter(isObject).map((event) => ({
    id: event.id,
    type: shortText(event.type, 100) ?? "client.event",
    actor: email,
    description: shortText(event.description, 1000) ?? "",
    timestamp: shortText(event.timestamp, 40) ?? "",
    ...(typeof event.commentId === "number" && before.has(event.commentId) ? { commentId: event.commentId } : {}),
  }));
  if (events.length) lists.auditEvents = { upsert: events as ListChange["upsert"], remove: [] };

  const notes = (changes.lists?.notifications?.upsert ?? []).filter(isObject);
  const known = notes.length
    ? new Set((await db.select({ id: notifications.id }).from(notifications).where(inArray(notifications.id, notes.map((note) => note.id)))).map((row) => row.id))
    : new Set<number>();
  const fresh = notes
    .filter((note) => !known.has(note.id))
    .map((note) => ({ id: note.id, message: shortText(note.message, 500) ?? "", time: shortText(note.time, 40) ?? "" }));
  if (fresh.length) lists.notifications = { upsert: fresh, remove: [] };

  const sanitized: StateChanges = { lists, maps, settings: { upsert: {}, remove: [] } };
  return Object.keys(lists).length || Object.keys(maps).length ? sanitized : null;
}

