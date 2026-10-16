// What a client does on their review page, one action at a time (routes under /api/review/:token/).
// Each action is turned into changes built from what the database holds, not from the page's copy,
// then goes through the same rules as every client write (sanitizeReviewChanges in reviewAccess.ts)
// and is applied in one transaction, with its audit event and, for decisions, the agency's notification.

import { and, eq } from "drizzle-orm";
import type { ListChange, StateChanges } from "@/lib/sharedState";
import { displayedNow, freeCommentId, id, movedComment, noChanges, percent, readArea, readPoint, text, number, type Area, type Data } from "./actions";
import type { Db } from "./client";
import { clientSeesComment, sanitizeReviewChanges, type ReviewAccess } from "./reviewAccess";
import { reviewProfileName } from "./reviewAuth";
import { commentProposals, comments } from "./schema";
import { applyChanges, type Writer } from "./state";

export type ReviewAction =
  | { type: "comment.create"; id?: number; message: string; location?: string; page?: number; position?: { x: number; y: number }; area?: Area; replies?: { id?: number; message: string }[] }
  | { type: "comment.edit"; commentId: number; message: string }
  | { type: "comment.move"; commentId: number; page: number; x: number; y: number }
  | { type: "comment.delete"; commentId: number }
  | { type: "reply.create"; commentId: number; id?: number; message: string }
  | { type: "reply.edit"; commentId: number; replyId: number; message: string }
  | { type: "reply.delete"; commentId: number; replyId: number }
  | { type: "proposal.decide"; commentId: number; decision: "accepted" | "refused" }
  | { type: "proposal.adapt"; commentId: number; message: string; budget?: number; deadline?: number }
  | { type: "version.approve" }
  | { type: "version.request-changes"; message: string };

export type ReviewActionResult = { ok: true; revision: number; id?: number } | { ok: false; status: number; error: string };

const refused = (error = "Cette action n’est pas possible sur cette version.", status = 409): ReviewActionResult => ({ ok: false, status, error });

// ——— Reading what the page sends ———

/** The action described by a request body, or null when it is malformed. */
export function readReviewAction(type: ReviewAction["type"], body: Data, params: { commentId?: string; replyId?: string } = {}): ReviewAction | null {
  const commentId = id(Number(params.commentId));
  const replyId = id(Number(params.replyId));
  const message = text(body.message);
  switch (type) {
    case "comment.create": {
      if (!message) return null;
      const point = readPoint(body.position);
      const replies = Array.isArray(body.replies)
        ? body.replies.slice(0, 100).flatMap((reply) => {
            const replyText = text((reply as Data)?.message);
            return replyText ? [{ id: id((reply as Data).id), message: replyText }] : [];
          })
        : undefined;
      return { type, id: id(body.id), message, location: text(body.location, 200), page: id(body.page), position: point, area: point ? readArea(body.area) : undefined, replies };
    }
    case "comment.edit":
      return commentId && message ? { type, commentId, message } : null;
    case "comment.move": {
      const page = id(body.page);
      const [x, y] = [percent(body.x), percent(body.y)];
      return commentId && page && x !== undefined && y !== undefined ? { type, commentId, page, x, y } : null;
    }
    case "comment.delete":
      return commentId ? { type, commentId } : null;
    case "reply.create":
      return commentId && message ? { type, commentId, id: id(body.id), message } : null;
    case "reply.edit":
      return commentId && replyId && message ? { type, commentId, replyId, message } : null;
    case "reply.delete":
      return commentId && replyId ? { type, commentId, replyId } : null;
    case "proposal.decide":
      return commentId && (body.decision === "accepted" || body.decision === "refused") ? { type, commentId, decision: body.decision } : null;
    case "proposal.adapt":
      return commentId && message ? { type, commentId, message, budget: number(body.budget, 0, 1e9), deadline: number(body.deadline, 0, 1e5) } : null;
    case "version.approve":
      return { type };
    case "version.request-changes":
      return message ? { type, message } : null;
  }
}

// ——— Turning an action into changes ———

/** Events and notifications the agency sees for a decision; ids past Date.now() ones, as in reviewAccess.ts. */
function decisionTrail(changes: StateChanges, type: string, description: string, notification: string, commentId?: number) {
  const stamp = Date.now() * 1000 + 500;
  const timestamp = displayedNow();
  changes.lists.auditEvents = { upsert: [{ id: stamp, type, description, timestamp, ...(commentId ? { commentId } : {}) }] as ListChange["upsert"], remove: [] };
  // The request it is about, so the agency's bell opens it (the version is set by the client rules).
  changes.lists.notifications = { upsert: [{ id: stamp + 1, message: notification, time: timestamp, ...(commentId ? { commentId } : {}) }] as ListChange["upsert"], remove: [] };
}

/** Quotes sent on the shared version that the client has not decided (nor the agency closed by refusing a counter-proposal). */
async function quotesAwaitingClient(db: Db, access: ReviewAccess) {
  const rows = await db
    .select({ decision: commentProposals.decision, adaptation: commentProposals.adaptation })
    .from(commentProposals)
    .innerJoin(comments, and(eq(comments.organizationId, commentProposals.organizationId), eq(comments.id, commentProposals.commentId)))
    .where(and(eq(commentProposals.organizationId, access.organizationId), eq(comments.deliverableId, access.deliverableId), eq(commentProposals.state, "sent")));
  return rows.filter((row) => (!row.decision || row.decision === "none") && !(row.adaptation as Data | null)?.decision).length;
}

/** Messages of the version's remarks still to clarify (not qualified as to do nor out of scope), oldest first. */
async function remarksToClarify(db: Db, access: ReviewAccess) {
  const rows = await db
    .select({ id: comments.id, decision: comments.decision, data: comments.data })
    .from(comments)
    .where(and(eq(comments.organizationId, access.organizationId), eq(comments.deliverableId, access.deliverableId)));
  return rows
    .filter((row) => row.decision !== "Inclus" && row.decision !== "Hors périmètre")
    .sort((left, right) => left.id - right.id)
    .map((row) => String((row.data as Data).message ?? "").trim())
    .filter(Boolean);
}

/** Changes for the action, from the stored records; the comment id it creates or touches. */
async function changesFor(db: Db, access: ReviewAccess, action: ReviewAction): Promise<{ changes: StateChanges; id?: number } | ReviewActionResult> {
  const org = access.organizationId;
  const changes = noChanges();
  const upsertComment = (comment: Data) => {
    changes.lists.comments = { upsert: [comment as ListChange["upsert"][number]], remove: [] };
  };

  if (action.type === "comment.create") {
    const commentId = await freeCommentId(db, org, action.id);
    const now = Date.now();
    upsertComment({
      id: commentId,
      deliverableId: access.deliverableId,
      from: "client",
      time: "À l'instant",
      createdAt: now,
      message: action.message,
      location: action.location ?? "Livrable (général)",
      decision: "À qualifier",
      kind: "remark",
      page: action.page ?? 1,
      ...(action.position ? { position: action.position } : {}),
      ...(action.area ? { area: action.area } : {}),
      ...(action.replies?.length
        ? { replies: action.replies.map((reply, index) => ({ id: reply.id ?? now + index + 1, from: "client", message: reply.message, time: "À l'instant", createdAt: now })) }
        : {}),
    });
    return { changes, id: commentId };
  }

  if (action.type === "version.approve") {
    // A validated version is locked: a quote still waiting for the client would stay undecided for good.
    const waiting = await quotesAwaitingClient(db, access);
    if (waiting) return refused(`${waiting} proposition${waiting > 1 ? "s attendent" : " attend"} votre décision : acceptez-la ou refusez-la avant de valider la version.`);
    changes.lists.deliverables = { upsert: [{ id: access.deliverableId, reviewStatus: "approved", approvedAt: displayedNow() }], remove: [] };
    // Remarks still to clarify are given up by validating (the page says so); the trail names them.
    const givenUp = await remarksToClarify(db, access);
    const quoted = givenUp.slice(0, 10).map((message) => `« ${message.length > 80 ? `${message.slice(0, 79)}…` : message} »`);
    const more = givenUp.length > 10 ? ` et ${givenUp.length - 10} autre${givenUp.length > 11 ? "s" : ""}` : "";
    decisionTrail(
      changes,
      "deliverable.approved",
      `Version ${access.version} approuvée par le client${givenUp.length ? ` ; remarque${givenUp.length > 1 ? "s" : ""} abandonnée${givenUp.length > 1 ? "s" : ""} : ${quoted.join(", ")}${more}` : ""}`,
      `Le client a approuvé la version ${access.version}${givenUp.length ? ` (${givenUp.length} remarque${givenUp.length > 1 ? "s" : ""} à clarifier abandonnée${givenUp.length > 1 ? "s" : ""})` : ""}`,
    );
    return { changes };
  }
  if (action.type === "version.request-changes") {
    changes.lists.deliverables = { upsert: [{ id: access.deliverableId, reviewStatus: "changes-requested" }], remove: [] };
    decisionTrail(changes, "review.changes-requested", `Le client demande des modifications : « ${action.message} »`, "Le client demande des modifications sur cette version");
    return { changes };
  }
  if (action.type === "proposal.decide") {
    const key = String(action.commentId);
    changes.maps.proposalDecisions = { upsert: { [key]: action.decision }, remove: [] };
    // The sent quote takes the decision (rebuilt from the stored history by the sanitizer).
    changes.maps.proposalVersions = { upsert: { [key]: [] }, remove: [] };
    const label = action.decision === "accepted" ? "acceptée" : "refusée";
    decisionTrail(changes, "proposal.decision", `Proposition ${label} par le client`, `Le client a ${label} la proposition liée au commentaire #${action.commentId}`, action.commentId);
    return { changes, id: action.commentId };
  }
  if (action.type === "proposal.adapt") {
    changes.maps.adaptationRequests = {
      upsert: { [String(action.commentId)]: { message: action.message, budget: action.budget, deadline: action.deadline, requestedAt: displayedNow() } },
      remove: [],
    };
    decisionTrail(
      changes,
      "proposal.adaptation-requested",
      `Adaptation demandée par le client sur la proposition #${action.commentId}`,
      `Le client demande une adaptation de la proposition liée au commentaire #${action.commentId}`,
      action.commentId,
    );
    return { changes, id: action.commentId };
  }

  // The others change a comment of this version, as stored.
  const [row] = await db
    .select({ data: comments.data })
    .from(comments)
    .where(and(eq(comments.organizationId, org), eq(comments.id, action.commentId), eq(comments.deliverableId, access.deliverableId)))
    .limit(1);
  if (!row) return refused("Commentaire introuvable.", 404);
  const comment = row.data as Data;
  const replies = Array.isArray(comment.replies) ? (comment.replies as Data[]) : [];

  switch (action.type) {
    case "comment.delete":
      changes.lists.comments = { upsert: [], remove: [action.commentId] };
      break;
    case "comment.edit":
      upsertComment({ ...comment, message: action.message, edited: true });
      break;
    case "comment.move": {
      const moved = movedComment(comment, action.page, action.x, action.y);
      if (!moved) return refused();
      upsertComment(moved);
      break;
    }
    case "reply.create": {
      const taken = new Set(replies.map((reply) => reply.id));
      const replyId = action.id && !taken.has(action.id) ? action.id : Math.max(Date.now(), ...replies.map((reply) => Number(reply.id) + 1 || 0));
      upsertComment({ ...comment, replies: [...replies, { id: replyId, from: "client", message: action.message, time: "À l'instant", createdAt: Date.now() }] });
      return { changes, id: replyId };
    }
    case "reply.edit":
      if (!replies.some((reply) => reply.id === action.replyId)) return refused("Message introuvable.", 404);
      upsertComment({ ...comment, replies: replies.map((reply) => (reply.id === action.replyId ? { ...reply, message: action.message, edited: true } : reply)) });
      break;
    case "reply.delete":
      if (!replies.some((reply) => reply.id === action.replyId)) return refused("Message introuvable.", 404);
      upsertComment({ ...comment, replies: replies.filter((reply) => reply.id !== action.replyId) });
      break;
  }
  return { changes, id: action.commentId };
}

/** Whether the rules kept the part of the changes the action is about. */
function kept(action: ReviewAction, sanitized: StateChanges | null, commentId: number | undefined) {
  if (!sanitized) return false;
  switch (action.type) {
    case "comment.delete":
      return Boolean(sanitized.lists.comments?.remove.includes(action.commentId));
    case "proposal.decide":
      return sanitized.maps.proposalDecisions?.upsert[String(action.commentId)] === action.decision;
    case "proposal.adapt":
      return Boolean(sanitized.maps.adaptationRequests?.upsert[String(action.commentId)]);
    case "version.approve":
    case "version.request-changes":
      return Boolean(sanitized.lists.deliverables?.upsert.length);
    default:
      return Boolean(sanitized.lists.comments?.upsert.some((comment) => comment.id === commentId));
  }
}

/** Runs one client action: checked by the client rules, then applied with its trail, or refused whole. */
export async function runReviewAction(db: Db, access: ReviewAccess, email: string, writer: Omit<Writer, "recordedBy">, action: ReviewAction): Promise<ReviewActionResult> {
  // A request the client does not see (an out-of-scope one not quoted yet) is unknown to them.
  if ("commentId" in action && !(await clientSeesComment(db, access, action.commentId))) return refused("Commentaire introuvable.", 404);
  const built = await changesFor(db, access, action);
  if ("ok" in built) return built;
  const commentId = action.type === "reply.create" || action.type === "reply.edit" || action.type === "reply.delete" ? action.commentId : built.id;
  const sanitized = await sanitizeReviewChanges(db, access, built.changes, email, await reviewProfileName(db, email));
  if (!kept(action, sanitized, commentId)) return refused();
  const { revision } = await applyChanges(db, access.organizationId, sanitized!, { recordedBy: `client:${email}`, ...writer });
  return { ok: true, revision, ...(built.id ? { id: built.id } : {}) };
}
