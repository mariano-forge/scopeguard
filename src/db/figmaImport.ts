// The comments of a « Figma » deliverable's file, brought into Kora (US-054, step 2b): read from Figma when
// the agency opens the deliverable or clicks « Actualiser » (a pull; Figma's own notices come later).
//
// What comes in, into the current round only:
// - each thread a client started on a page up for review, with its replies, as a request « À clarifier »:
//   the client's words, signed with the name Figma shows (not an identity Kora checked), its source
//   « Figma », and kept as the agency's draft until qualified (visibleToClient, src/db/reviewAccess.ts);
// - later replies to a thread already brought in, while its round is open.
// What stays in Figma: threads of the agency (the connected account, and the people the agency marked as
// its team), threads resolved before they were brought in, and threads on pages left out of the review.
// A thread is brought in once, whatever its round: its Figma id is kept.
//
// Which page a comment is on: Figma pins it on a screen and does not name the page, so Kora reads the
// round's screens once (Figma's tightest read) and keeps them with the round. A comment on a screen Kora
// does not know (made after the round's version, or on the bare canvas) comes in: a client's request is
// never lost to a guess.

import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { initialsOf } from "@/lib/authors";
import { readFigmaComments, readFigmaFrames, type FigmaComment } from "@/lib/figma";
import type { FigmaRound } from "@/lib/figmaLink";
import type { Entity, ListChange, SharedState, StateChanges } from "@/lib/sharedState";
import { noChanges, trail, versionClosed, type Data } from "./actions";
import type { Db } from "./client";
import { figmaAccessToken, figmaConnectedUser, figmaRefused, isRefusal, notConnected } from "./figmaConnection";
import { withinLimit } from "./requestLimits";
import { comments } from "./schema";
import { readState } from "./state";

type Refusal = { ok: false; status: number; error: string; code?: string };
type Built = { changes: StateChanges; data: Data };

/** The agency's people in Figma, by Figma user id: their comments are the agency's, not the client's. */
export type FigmaTeam = Record<string, string>;
/** Per deliverable version: when it was last brought in, and when its screens were last asked for. */
type Imports = Record<string, { at: string; framesTriedAt?: string }>;

/** A file's comments are read again at most this often: « Actualiser » clicked twice reads Figma once. */
const quietSeconds = () => Math.max(1, Number(process.env.FIGMA_IMPORT_QUIET_SECONDS) || 15);
/** Figma refused the round's screens (its limit): asked again at most this often. */
const framesRetryMs = 60 * 60 * 1000;

const refused = (error: string, status = 409, code?: string): Refusal => ({ ok: false, status, error, ...(code ? { code } : {}) });

export const teamOf = (state: SharedState | null): FigmaTeam => ((state?.figmaTeam ?? {}) as FigmaTeam) || {};

/** The versions of the deliverable `record` belongs to (same project, same name). */
const versionsOf = (state: SharedState, record: Entity) =>
  (state.deliverables ?? []).filter((other) => (other.projectId ?? 1) === (record.projectId ?? 1) && other.name === record.name);

const frenchTime = (iso: string) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });
};

/** The address that opens the comment in Figma. */
const commentUrl = (fileKey: string, comment: FigmaComment) => `https://www.figma.com/design/${fileKey}${comment.nodeId ? `?node-id=${encodeURIComponent(comment.nodeId.replace(/:/g, "-"))}` : ""}#${comment.id}`;

/** Free comment ids for `count` new comments, after the time now (ids of the interface: Date.now()). */
async function freeCommentIds(db: Db, org: string, count: number) {
  const start = Date.now();
  const candidates = Array.from({ length: count + 50 }, (_, index) => start + index);
  const used = new Set((await db.select({ id: comments.id }).from(comments).where(and(eq(comments.organizationId, org), inArray(comments.id, candidates)))).map((row) => row.id));
  return candidates.filter((candidate) => !used.has(candidate)).slice(0, count);
}

function reply(comment: FigmaComment, id: number, agency: boolean) {
  return {
    id,
    author: comment.user.handle,
    initials: initialsOf(comment.user.handle),
    from: agency ? "agency" : "client",
    message: comment.message,
    time: frenchTime(comment.createdAt),
    createdAt: Date.parse(comment.createdAt) || Date.now(),
    figmaId: comment.id,
  };
}

/** Changes that bring the file's new comments into the round `deliverableId`, and what was brought. */
export async function figmaImportChanges(db: Db, org: string, actor: string, deliverableId: number): Promise<Built | Refusal> {
  const { state: stored } = await readState(db, org);
  const state: SharedState = stored ?? ({} as SharedState);
  const record = (state.deliverables ?? []).find((candidate) => candidate.id === deliverableId);
  const round = record?.figma as FigmaRound | undefined;
  if (!record || record.type !== "Figma" || !round) return refused("Livrable introuvable.", 404);
  // Only the round under review takes new comments: a replaced or validated one is part of a proof.
  if (await versionClosed(db, org, deliverableId)) return refused("Les commentaires de Figma arrivent dans la tournée en cours.");
  if (!(await withinLimit(db, `figma-import:${org}:${deliverableId}`, { max: 1, seconds: quietSeconds() }))) return { changes: noChanges(), data: { imported: 0, replies: 0, waited: true } };

  const token = await figmaAccessToken(db, org);
  if (!token) return notConnected;
  const read = await readFigmaComments(token, round.fileKey);
  if (isRefusal(read)) return figmaRefused(read);

  const changes = noChanges();
  const imports = { ...((state.figmaImports ?? {}) as Imports) };
  const mark = imports[String(deliverableId)] ?? { at: "" };
  // The round's screens, read once: they say which page each comment is on.
  // Kept with the round as screen id -> page id: the agency's state is read every few seconds.
  let frames = round.frames;
  if (!frames && (!mark.framesTriedAt || Date.now() - Date.parse(mark.framesTriedAt) > framesRetryMs)) {
    const found = await readFigmaFrames(token, round.fileKey, round.version.id);
    if (Array.isArray(found)) frames = Object.fromEntries(found.map((frame) => [frame.id, frame.pageId]));
    else mark.framesTriedAt = new Date().toISOString();
  }

  const connected = await figmaConnectedUser(db, org);
  const team = teamOf(state);
  const isAgency = (userId: string) => userId === connected || Object.hasOwn(team, userId);

  // Threads already brought in, whatever their round; those of this round take their new replies.
  const versionIds = new Set(versionsOf(state, record).map((version) => version.id));
  const known = new Map<string, Entity>();
  for (const comment of state.comments ?? []) {
    const figmaId = (comment.figma as Data | undefined)?.commentId;
    if (typeof figmaId === "string" && versionIds.has(comment.deliverableId as number)) known.set(figmaId, comment);
  }
  const repliesOf = new Map<string, FigmaComment[]>();
  for (const comment of read) if (comment.parentId) repliesOf.set(comment.parentId, [...(repliesOf.get(comment.parentId) ?? []), comment]);
  const byDate = (left: FigmaComment, right: FigmaComment) => left.createdAt.localeCompare(right.createdAt);

  const upserts: Data[] = [];
  let replyCount = 0;
  const fresh: { root: FigmaComment; pageId?: string }[] = [];
  for (const root of read.filter((comment) => !comment.parentId).sort(byDate)) {
    const existing = known.get(root.id);
    if (existing) {
      if (existing.deliverableId !== deliverableId) continue;
      const current = Array.isArray(existing.replies) ? (existing.replies as Data[]) : [];
      const seen = new Set(current.map((item) => item.figmaId));
      const added = (repliesOf.get(root.id) ?? []).filter((item) => !seen.has(item.id)).sort(byDate);
      if (!added.length) continue;
      const base = Math.max(Date.now(), ...current.map((item) => Number(item.id) + 1 || 0));
      upserts.push({ ...existing, replies: [...current, ...added.map((item, index) => reply(item, base + index, isAgency(item.user.id)))] });
      replyCount += added.length;
      continue;
    }
    if (root.resolved || isAgency(root.user.id)) continue;
    const pageId = root.nodeId && frames ? frames[root.nodeId] : undefined;
    if (pageId && !round.reviewed.includes(pageId)) continue;
    fresh.push({ root, pageId });
  }

  const ids = await freeCommentIds(db, org, fresh.length);
  const log = trail(actor, deliverableId);
  fresh.forEach(({ root, pageId }, index) => {
    const page = pageId ? round.pages.find((candidate) => candidate.id === pageId) : undefined;
    const replies = (repliesOf.get(root.id) ?? []).sort(byDate);
    const base = Date.now();
    replyCount += replies.length;
    upserts.push({
      id: ids[index],
      deliverableId,
      author: root.user.handle,
      initials: initialsOf(root.user.handle),
      from: "client",
      message: root.message,
      time: frenchTime(root.createdAt),
      createdAt: Date.parse(root.createdAt) || Date.now(),
      location: ["Figma", page?.name].filter(Boolean).join(" · "),
      decision: "À qualifier",
      kind: "remark",
      page: 1,
      source: { channel: "figma", ...(/^\d{4}-\d{2}-\d{2}/.test(root.createdAt) ? { receivedAt: root.createdAt.slice(0, 10) } : {}) },
      figma: { commentId: root.id, authorId: root.user.id, orderId: root.orderId, nodeId: root.nodeId, pageId: pageId ?? null, url: commentUrl(round.fileKey, root) },
      replies: replies.map((item, offset) => reply(item, base + offset, isAgency(item.user.id))),
    });
    log.add("comment.imported", `Commentaire Figma de ${root.user.handle} importé${root.orderId ? ` (n° ${root.orderId} dans Figma)` : ""}`, ids[index]);
  });

  if (upserts.length) changes.lists.comments = { upsert: upserts as ListChange["upsert"], remove: [] };
  if (frames && !round.frames) changes.lists.deliverables = { upsert: [{ ...record, figma: { ...round, frames } }] as ListChange["upsert"], remove: [] };
  imports[String(deliverableId)] = { ...mark, at: new Date().toISOString() };
  changes.settings.upsert.figmaImports = imports;
  log.into(changes);
  return { changes, data: { imported: fresh.length, replies: replyCount, frames: Boolean(frames) } };
}

/**
 * Marks a person of Figma as the agency's (or the client's again). Their threads not yet qualified, in
 * rounds still open, leave Kora: they were the agency's own talk, not requests. Qualified ones stay.
 */
export async function figmaTeamChanges(db: Db, org: string, actor: string, figmaUserId: string, handle: string, member: boolean): Promise<Built | Refusal> {
  const { state: stored } = await readState(db, org);
  const state: SharedState = stored ?? ({} as SharedState);
  const team = { ...teamOf(state) };
  if (member) team[figmaUserId] = handle;
  else delete team[figmaUserId];
  const changes = noChanges();
  changes.settings.upsert.figmaTeam = team;
  const removed: number[] = [];
  if (member) {
    for (const comment of state.comments ?? []) {
      const figma = comment.figma as Data | undefined;
      const titled = typeof comment.title === "string" && comment.title.trim() !== "";
      if (figma?.authorId !== figmaUserId || comment.decision !== "À qualifier" || titled) continue;
      if (await versionClosed(db, org, comment.deliverableId as number)) continue;
      removed.push(comment.id);
    }
    if (removed.length) changes.lists.comments = { upsert: [], remove: removed };
  }
  const log = trail(actor, null);
  log.add("figma.team", member ? `${handle} (Figma) marqué comme membre de l’équipe` : `${handle} (Figma) n’est plus marqué comme membre de l’équipe`);
  log.into(changes);
  return { changes, data: { removed: removed.length } };
}
