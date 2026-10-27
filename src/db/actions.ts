// Shared by the action routes of the client (reviewActions.ts) and of the agency (agencyActions.ts):
// reading what a page sends, and the parts every action builds the same way.

import { and, eq, inArray } from "drizzle-orm";
import type { ListChange, StateChanges } from "@/lib/sharedState";
import { areaFromPin } from "@/lib/pinArea";
import type { Db } from "./client";
import { commentProposals, comments, deliverables } from "./schema";

export type Data = Record<string, unknown>;
export type Area = { x: number; y: number; w: number; h: number };

export const number = (value: unknown, min: number, max: number) => (typeof value === "number" && Number.isFinite(value) && value >= min && value <= max ? value : undefined);
export const id = (value: unknown) => (typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : undefined);
export const text = (value: unknown, max = 5000) => {
  const trimmed = typeof value === "string" ? value.trim().slice(0, max) : "";
  return trimmed || undefined;
};
export const percent = (value: unknown) => number(value, 0, 100);

/** A comment's area on its page, in % of the page. */
export function readArea(value: unknown): Area | undefined {
  if (!value || typeof value !== "object") return undefined;
  const { x, y, w, h } = value as Data;
  const area = { x: percent(x), y: percent(y), w: percent(w), h: percent(h) };
  return Object.values(area).every((field) => field !== undefined) ? (area as Area) : undefined;
}

/** A point on a page, in % of the page. */
export function readPoint(value: unknown) {
  const point = value && typeof value === "object" ? (value as Data) : null;
  return point && percent(point.x) !== undefined && percent(point.y) !== undefined ? { x: point.x as number, y: point.y as number } : undefined;
}

/** The French date and time shown to people, as the pages write it. */
export const displayedNow = () => new Date().toLocaleString("fr-FR", { timeZone: "Europe/Paris" });

export const noChanges = (): StateChanges => ({ lists: {}, maps: {}, settings: { upsert: {}, remove: [] } });

/** A free comment id: the one the page chose if no record of the agency uses it, else a new one. */
export async function freeCommentId(db: Db, org: string, wanted: number | undefined) {
  const candidates = [...(wanted ? [wanted] : []), ...Array.from({ length: 10 }, (_, index) => Date.now() + index)];
  const used = new Set(
    (await db.select({ id: comments.id }).from(comments).where(and(eq(comments.organizationId, org), inArray(comments.id, candidates)))).map((row) => row.id),
  );
  return candidates.find((candidate) => !used.has(candidate))!;
}

/** A comment moved to another point: its drawn area follows, its "Page n" location too. */
export function movedComment(comment: Data, page: number, x: number, y: number): Data | null {
  const position = comment.position as { x: number; y: number } | undefined;
  if (!position) return null;
  const area = comment.area as Area | undefined;
  return {
    ...comment,
    page,
    position: { x, y },
    // The pin is one corner of its zone: that corner follows it, the opposite one stays (src/lib/pinArea.ts).
    ...(area ? { area: areaFromPin(area, position, x, y) } : {}),
    location: typeof comment.location === "string" ? comment.location.replace(/^Page \d+/, `Page ${page}`) : comment.location,
  };
}

/** A stored comment of the agency, with the version it belongs to. */
export async function storedComment(db: Db, org: string, commentId: number) {
  const [row] = await db.select({ data: comments.data, deliverableId: comments.deliverableId }).from(comments).where(and(eq(comments.organizationId, org), eq(comments.id, commentId))).limit(1);
  return row ? { data: row.data as Data, deliverableId: row.deliverableId } : null;
}

/** A version that no longer takes comments: approved or replaced by a newer one. */
export async function versionClosed(db: Db, org: string, deliverableId: number | null) {
  if (deliverableId === null) return true;
  const [record] = await db.select().from(deliverables).where(and(eq(deliverables.organizationId, org), eq(deliverables.id, deliverableId))).limit(1);
  if (!record) return true;
  const data = record.data as Data;
  return record.reviewStatus === "approved" || Boolean(record.locked) || data.status === "Approuvée" || data.status === "Remplacée";
}

/** The client decided on the request's quote, or the agency on their counter-proposal: it is settled. */
export async function decisionLocked(db: Db, org: string, commentId: number) {
  const [proposal] = await db.select().from(commentProposals).where(and(eq(commentProposals.organizationId, org), eq(commentProposals.commentId, commentId))).limit(1);
  if (!proposal) return false;
  return (proposal.decision !== null && proposal.decision !== "none") || Boolean((proposal.adaptation as Data | null)?.decision);
}

/** The client accepted this request's proposal, or the counter-proposal they asked for. */
export async function proposalAccepted(db: Db, org: string, commentId: number) {
  const [proposal] = await db.select().from(commentProposals).where(and(eq(commentProposals.organizationId, org), eq(commentProposals.commentId, commentId))).limit(1);
  return proposal?.decision === "accepted" || (proposal?.adaptation as Data | null | undefined)?.decision === "accepted";
}

/** A proposal sent for this request still waits for the client's answer. */
export async function proposalAwaiting(db: Db, org: string, commentId: number) {
  const [proposal] = await db.select().from(commentProposals).where(and(eq(commentProposals.organizationId, org), eq(commentProposals.commentId, commentId))).limit(1);
  return proposal?.state === "sent" && !(proposal.decision !== null && proposal.decision !== "none") && !(proposal.adaptation as Data | null)?.decision;
}

/** Audit events of one action: distinct ids (several events may share a millisecond). */
export function trail(actor: string, deliverableId: number | null) {
  const stamp = Date.now() * 1000;
  const events: Data[] = [];
  return {
    add(type: string, description: string, commentId?: number) {
      events.push({ id: stamp + events.length, type, actor, description, timestamp: displayedNow(), ...(commentId ? { commentId } : {}), ...(deliverableId ? { deliverableId } : {}) });
    },
    into(changes: StateChanges) {
      if (events.length) changes.lists.auditEvents = { upsert: events as ListChange["upsert"], remove: [] };
    },
  };
}
