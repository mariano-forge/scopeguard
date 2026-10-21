// What a client review link gives access to. The client has no account: the link token is the key,
// and it only opens the deliverable version it was created for.
//
// Reading: that version, its comments and their proposals; nothing about other clients or projects.
// Writing: what the client page can do, checked here rather than trusted:
//   - comments: add its own remarks, edit/move/delete them, reply in any thread of this version;
//     never change the agency's messages or a qualification (decision, title, quote…);
//   - proposals: accept or refuse a sent proposal once, or ask for an adaptation when the agency allows it;
//   - the version: request changes or approve it, never undo an approval;
//   - audit events and notifications: add new ones, signed with the verified address.
// What the client writes is signed by the server with their name and verified address, whatever the page sends.
// Nothing can be written once the version is approved or replaced.

import { and, eq, inArray } from "drizzle-orm";
import { sameValue, type ListChange, type MapChange, type SharedState, type StateChanges } from "@/lib/sharedState";
import { initialsOf, sideOf } from "@/lib/authors";
import { siteOriginOf } from "@/lib/siteReview";
import { linkExpired } from "@/lib/linkDeciders";
import type { Db } from "./client";
import { commentProposals, comments, deliverables, notifications, proposalVersions, reviewLinks } from "./schema";
import { readState } from "./state";

type Data = Record<string, unknown>;
type Reply = { id?: unknown; initials?: unknown } & Data;

/** Written by the client (src/lib/authors.ts: `from`, or "CM" initials on older messages). */
const byClient = (message: Data | undefined) => Boolean(message) && sideOf(message!) === "client";
const same = (left: unknown, right: unknown) => sameValue(left ?? null, right ?? null);
const isObject = (value: unknown): value is Data => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const shortText = (value: unknown, max: number) => (typeof value === "string" ? value.slice(0, max) : undefined);

/** A valid link: its agency, key ("deliverableId:version"), data and the version it opens. */
export type ReviewAccess = { organizationId: string; key: string; link: Data; deliverableId: number; version: number };

/** "31/12/2026" -> end of that day; an unreadable date counts as expired. */
export const expired = (link: Data) => linkExpired(link);

/** The link behind a token, if it is active and not expired. */
export async function findReviewAccess(db: Db, token: string): Promise<ReviewAccess | null> {
  if (!token || token.length > 200) return null;
  const [row] = await db.select().from(reviewLinks).where(eq(reviewLinks.token, token)).limit(1);
  if (!row || !row.active || row.deliverableId === null || row.version === null) return null;
  const link = row.data as Data;
  if (link.active !== true || expired(link)) return null;
  return { organizationId: row.organizationId, key: row.key, link, deliverableId: row.deliverableId, version: row.version };
}

/** The staging site the shared version is (a « Lien » deliverable): the one origin that may frame its panel. */
export async function reviewedSiteOrigin(db: Db, access: ReviewAccess) {
  const [row] = await db
    .select({ data: deliverables.data })
    .from(deliverables)
    .where(and(eq(deliverables.organizationId, access.organizationId), eq(deliverables.id, access.deliverableId)))
    .limit(1);
  return siteOriginOf(row?.data as Data | undefined);
}

/** Every version of the deliverable `deliverableId` belongs to (same project and name), latest first. */
async function versionsOf(db: Db, organizationId: string, deliverableId: number) {
  const [record] = await db.select({ projectId: deliverables.projectId, name: deliverables.name }).from(deliverables).where(and(eq(deliverables.organizationId, organizationId), eq(deliverables.id, deliverableId))).limit(1);
  if (!record) return [];
  const rows = await db
    .select({ id: deliverables.id, projectId: deliverables.projectId, version: deliverables.version, data: deliverables.data })
    .from(deliverables)
    .where(and(eq(deliverables.organizationId, organizationId), eq(deliverables.name, record.name)));
  return rows.filter((row) => (row.projectId ?? 1) === (record.projectId ?? 1)).sort((left, right) => right.version - left.version);
}

/** The first version of the deliverable `deliverableId` belongs to: what names it for good (src/app/(agency)/routes.ts livrableIdOf). */
export async function livrableIdOfVersion(db: Db, organizationId: string, deliverableId: number) {
  const versions = await versionsOf(db, organizationId, deliverableId);
  return versions.length ? Math.min(...versions.map((version) => version.id)) : null;
}

/**
 * A « Lien » deliverable as its key opens it (src/lib/siteKey.ts): its latest version (site and
 * number), and its latest version shared with an active link, if any (site, number and token): the one
 * the panel opens. Null when the deliverable is gone.
 */
export async function latestSharedSite(db: Db, organizationId: string, livrableId: number) {
  const versions = await versionsOf(db, organizationId, livrableId);
  if (!versions.length) return null;
  const latest = { site: siteOriginOf(versions[0].data as Data), version: versions[0].version };
  const links = await db
    .select()
    .from(reviewLinks)
    .where(and(eq(reviewLinks.organizationId, organizationId), inArray(reviewLinks.key, versions.map((version) => `${version.id}:${version.version}`))));
  for (const version of versions) {
    const row = links.find((link) => link.key === `${version.id}:${version.version}`);
    const link = row?.data as Data | undefined;
    if (row?.active && link?.active === true && !expired(link))
      return { latest, shared: { site: siteOriginOf(version.data as Data), version: version.version, token: row.token } };
  }
  return { latest, shared: null };
}

/** What the client page needs of its link. */
const publicLink = (link: Data) => {
  const shown: Data = {};
  for (const field of ["token", "active", "expiresAt", "autoExpire", "deliverableId", "version"]) if (field in link) shown[field] = link[field];
  return shown;
};

/**
 * What the client sees of a version: their own requests always; of the agency's, those whose status it
 * chose. A pin the agency drops on the deliverable has none until qualified: it is the agency's draft.
 * A request from « + Demande » is created with a chosen status and a title, even « À clarifier »: it shows.
 * « Hors scope » shows as soon as it is qualified, its status said (decided with the product owner on
 * 19 October 2026); a draft quote's amount never leaves the server (readReviewState).
 */
export function visibleToClient(comment: Data) {
  if (byClient(comment)) return true;
  if (comment.decision === "Hors périmètre" || comment.decision === "Inclus") return true;
  // Still to clarify: shown only when the agency chose that status (« + Demande », always titled).
  return typeof comment.title === "string" && comment.title.trim() !== "";
}

/** Whether a request of the shared version is one the client may see, and so act on. */
export async function clientSeesComment(db: Db, access: ReviewAccess, commentId: number) {
  const org = access.organizationId;
  const [row] = await db
    .select({ data: comments.data })
    .from(comments)
    .where(and(eq(comments.organizationId, org), eq(comments.id, commentId), eq(comments.deliverableId, access.deliverableId)))
    .limit(1);
  return Boolean(row) && visibleToClient(row.data as Data);
}

/** The part of the shared state the client page needs, in the same shape. */
export async function readReviewState(db: Db, access: ReviewAccess) {
  const { revision, state } = await readState(db, access.organizationId);
  if (!state) return { revision, state: null };

  const record = state.deliverables?.find((item) => item.id === access.deliverableId && item.version === access.version);
  const project = state.projects?.find((item) => item.id === ((record?.projectId as number | undefined) ?? 1));
  const client = state.clients?.find((item) => item.id === ((project?.clientId as number | undefined) ?? 1));
  // A request out of draft shows whole: its first words and every reply (decided 19 October 2026).
  const shown = (state.comments ?? []).filter((comment) => comment.deliverableId === access.deliverableId && visibleToClient(comment));
  const ids = new Set(shown.map((comment) => String(comment.id)));
  // A pin tied to a request the client does not see (src/db/agencyActions.ts pinnedOn) does not name it.
  const versionComments = shown.map((comment) => {
    if (comment.pinnedOn === undefined || ids.has(String(comment.pinnedOn))) return comment;
    const rest = { ...comment };
    delete rest.pinnedOn;
    return rest;
  });
  const only = (map: Record<string, unknown> | undefined) => Object.fromEntries(Object.entries(map ?? {}).filter(([key]) => ids.has(key)));
  // Draft quotes never leave the server: neither their amounts nor the fact that one is being prepared.
  const sentStates = Object.fromEntries(Object.entries(only(state.proposalStates)).filter(([, value]) => value === "sent"));
  const sentQuotes = Object.fromEntries(
    Object.entries(only(state.proposalVersions)).map(([key, list]) => [key, Array.isArray(list) ? list.filter((quote) => isObject(quote) && quote.status !== "draft") : []]),
  );

  const filtered: SharedState = {
    clients: client ? [{ id: client.id, name: client.name }] : [],
    projects: project ? [{ id: project.id, name: project.name, clientId: project.clientId }] : [],
    deliverables: record ? [record] : [],
    comments: versionComments,
    notifications: [],
    auditEvents: [],
    // The link without its invitations: a client never sees who else is invited, nor their personal links.
    reviewLinks: { [access.key]: publicLink(access.link) },
    proposalStates: sentStates,
    proposalDecisions: only(state.proposalDecisions),
    adaptationRequests: only(state.adaptationRequests),
    proposalVersions: sentQuotes,
    reviewLink: null,
  };
  return { revision, state: filtered };
}

/**
 * What an agency member sees in the panel on the staging site: every request of the shared version,
 * its own internal pins included, each marked with whether the client sees it. Nothing of the other
 * versions, projects or invitations: the panel only needs this version's requests.
 */
export async function readSiteAgencyState(db: Db, access: ReviewAccess) {
  const { revision, state } = await readState(db, access.organizationId);
  if (!state) return { revision, state: null };
  const record = state.deliverables?.find((item) => item.id === access.deliverableId && item.version === access.version);
  const versionComments = (state.comments ?? [])
    .filter((comment) => comment.deliverableId === access.deliverableId)
    .map((comment) => ({ ...comment, clientSees: visibleToClient(comment) }));
  const filtered: SharedState = {
    clients: [],
    projects: [],
    deliverables: record ? [record] : [],
    comments: versionComments,
    notifications: [],
    auditEvents: [],
    reviewLinks: { [access.key]: publicLink(access.link) },
    proposalStates: {},
    proposalDecisions: {},
    adaptationRequests: {},
    proposalVersions: {},
    reviewLink: null,
  };
  return { revision, state: filtered };
}

/** Replies of `before` kept as they were, except the client's own, which may change or go. */
function repliesAllowed(before: Reply[], after: Reply[]) {
  const afterById = new Map(after.map((reply) => [reply.id, reply]));
  for (const reply of before)
    if (!byClient(reply) && !same(afterById.get(reply.id), reply)) return false;
  const known = new Set(before.map((reply) => reply.id));
  return after.every((reply) => known.has(reply.id) || byClient(reply));
}

const qualificationFields = ["id", "deliverableId", "author", "initials", "from", "authorEmail", "decision", "kind", "title", "description", "sourceId", "createdAt"];
const placementFields = ["message", "edited", "location", "page", "position", "area"];

function commentAllowed(before: Data | undefined, after: Data, deliverableId: number) {
  if (after.deliverableId !== deliverableId) return false;
  const replies = (value: unknown) => (Array.isArray(value) ? (value as Reply[]) : []);
  if (!before)
    return (
      byClient(after) &&
      after.decision === "À qualifier" &&
      (after.kind ?? "remark") === "remark" &&
      after.title === undefined &&
      after.description === undefined &&
      replies(after.replies).every((reply) => byClient(reply))
    );
  if (qualificationFields.some((field) => !same(before[field], after[field]))) return false;
  if (!byClient(before) && placementFields.some((field) => !same(before[field], after[field]))) return false;
  const known = new Set([...qualificationFields, ...placementFields, "replies", "time"]);
  if ([...Object.keys(before), ...Object.keys(after)].some((field) => !known.has(field) && !same(before[field], after[field]))) return false;
  return repliesAllowed(replies(before.replies), replies(after.replies));
}

/** Keeps only what the client may write (see the header); everything else is dropped. */
export async function sanitizeReviewChanges(
  db: Db,
  access: ReviewAccess,
  changes: StateChanges,
  email: string,
  /** The client's full name (review_profiles); the address stands in until they give it. */
  name: string | null,
): Promise<StateChanges | null> {
  const signer = { author: name ?? email, initials: initialsOf(name ?? email), from: "client", authorEmail: email };
  const org = access.organizationId;
  const [record] = await db
    .select()
    .from(deliverables)
    .where(and(eq(deliverables.organizationId, org), eq(deliverables.id, access.deliverableId)))
    .limit(1);
  if (!record || record.version !== access.version) return null;
  const recordData = record.data as Data;
  if (record.reviewStatus === "approved" || record.locked || recordData.status === "Approuvée" || recordData.status === "Remplacée") return null;

  const existing = await db.select().from(comments).where(and(eq(comments.organizationId, org), eq(comments.deliverableId, access.deliverableId)));
  const before = new Map(existing.map((row) => [row.id, row.data as Data]));
  const lists: StateChanges["lists"] = {};
  const maps: StateChanges["maps"] = {};

  // Comments of this version only; ids used by another version are refused too.
  const incoming = changes.lists?.comments;
  if (incoming) {
    const candidates = (incoming.upsert ?? []).filter(isObject) as ListChange["upsert"];
    const taken = candidates.length
      ? new Set(
          (await db.select({ id: comments.id }).from(comments).where(and(eq(comments.organizationId, org), inArray(comments.id, candidates.map((comment) => comment.id)))))
            .map((row) => row.id)
            .filter((id) => !before.has(id)),
        )
      : new Set<number>();
    const upsert = candidates
      .filter((comment) => !taken.has(comment.id) && commentAllowed(before.get(comment.id), comment, access.deliverableId))
      .map((comment) => {
        // New remarks and replies of the client are signed by the server: name, initials, verified address.
        const previous = before.get(comment.id);
        const known = new Set((Array.isArray(previous?.replies) ? (previous.replies as Reply[]) : []).map((reply) => reply.id));
        const replies = Array.isArray(comment.replies)
          ? (comment.replies as Reply[]).map((reply) => (known.has(reply.id) ? reply : { ...reply, ...signer }))
          : comment.replies;
        return { ...comment, ...(previous ? {} : signer), ...(replies ? { replies } : {}) };
      });
    const remove = (incoming.remove ?? []).filter((id) => {
      const comment = before.get(id);
      // Their own comment, while the agency has not qualified it (no title given) nor closed it.
      return byClient(comment) && comment!.decision === "À qualifier" && !String(comment!.title ?? "").trim() && comment!.closed !== true;
    });
    if (upsert.length || remove.length) lists.comments = { upsert, remove };
  }

  // Proposals: only on this version's comments, and only once one was sent.
  const commentIds = [...before.keys()];
  const proposals = commentIds.length ? await db.select().from(commentProposals).where(and(eq(commentProposals.organizationId, org), inArray(commentProposals.commentId, commentIds))) : [];
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
    const stored = await db.select().from(proposalVersions).where(and(eq(proposalVersions.organizationId, org), inArray(proposalVersions.commentId, decidedIds)));
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
  // The agency may send a quote without the option to counter it.
  const askedIds = Object.keys(adaptations?.upsert ?? {}).map(Number).filter((key) => commentIds.includes(key));
  const noCounter = new Set(
    askedIds.length
      ? (await db.select().from(proposalVersions).where(and(eq(proposalVersions.organizationId, org), inArray(proposalVersions.commentId, askedIds))))
          .filter((row) => (row.data as Data).status === "sent" && (row.data as Data).allowCounter === false)
          .map((row) => String(row.commentId))
      : [],
  );
  for (const [key, value] of Object.entries(adaptations?.upsert ?? {})) {
    if (!sent(key) || !undecided(key) || noCounter.has(key) || !isObject(value)) continue;
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
    actor: signer.author,
    description: shortText(event.description, 1000) ?? "",
    timestamp: shortText(event.timestamp, 40) ?? "",
    deliverableId: access.deliverableId,
    ...(typeof event.commentId === "number" && before.has(event.commentId) ? { commentId: event.commentId } : {}),
  }));
  // What the client wrote also enters the trail (server time, verified address, origin): the proof
  // shows who asked what. Ids are scaled past Date.now() ones so they never meet the page's.
  const written = lists.comments?.upsert ?? [];
  const stamp = Date.now() * 1000;
  let n = 0;
  for (const comment of written) {
    const previous = before.get(comment.id);
    const quote = (text: unknown) => `« ${String(text ?? "").slice(0, 200)} »`;
    if (!previous)
      events.push({ id: stamp + n++, type: "comment.created", actor: signer.author, description: `Retour du client : ${quote(comment.message)}`, timestamp: "", deliverableId: access.deliverableId, commentId: comment.id });
    const known = new Set((Array.isArray(previous?.replies) ? (previous.replies as Reply[]) : []).map((reply) => reply.id));
    for (const reply of Array.isArray(comment.replies) ? (comment.replies as Reply[]) : [])
      if (!known.has(reply.id))
        events.push({ id: stamp + n++, type: "reply.created", actor: signer.author, description: `Réponse du client : ${quote(reply.message)}`, timestamp: "", deliverableId: access.deliverableId, commentId: comment.id });
  }
  if (events.length) lists.auditEvents = { upsert: events as ListChange["upsert"], remove: [] };

  const notes = (changes.lists?.notifications?.upsert ?? []).filter(isObject);
  const known = notes.length
    ? new Set((await db.select({ id: notifications.id }).from(notifications).where(and(eq(notifications.organizationId, org), inArray(notifications.id, notes.map((note) => note.id))))).map((row) => row.id))
    : new Set<number>();
  const fresh = notes
    .filter((note) => !known.has(note.id))
    .map((note) => ({
      id: note.id,
      message: shortText(note.message, 500) ?? "",
      time: shortText(note.time, 40) ?? "",
      // Where the agency's bell leads: this version, and the request when it is one of its own.
      deliverableId: access.deliverableId,
      ...(typeof note.commentId === "number" && before.has(note.commentId) ? { commentId: note.commentId } : {}),
    }));
  if (fresh.length) lists.notifications = { upsert: fresh, remove: [] };

  const sanitized: StateChanges = { lists, maps, settings: { upsert: {}, remove: [] } };
  return Object.keys(lists).length || Object.keys(maps).length ? sanitized : null;
}

