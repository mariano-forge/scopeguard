// What a member of the agency does in the editor, one action at a time (routes under /api/comments):
// comment threads, qualification, quotes, a version's validation and its client link.
// Each action is built from what the database holds, signed with the member, checked against the
// member's role (reservedActions) and applied in one transaction with its audit events.
// The agency's other writes still go through /api/state; they move here one subject at a time.

import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { initialsOf, sideOf } from "@/lib/authors";
import { formatProposalAmount, formatProposalDeadline } from "@/lib/proposalFormat";
import type { ListChange, StateChanges } from "@/lib/sharedState";
import {
  decisionLocked,
  displayedNow,
  freeCommentId,
  id,
  movedComment,
  noChanges,
  number,
  percent,
  readArea,
  readPoint,
  storedComment,
  text,
  versionClosed,
  type Area,
  type Data,
} from "./actions";
import { canManageAgency, reservedActions } from "./agencyPermissions";
import type { Db } from "./client";
import { commentProposals, deliverables, proposalVersions, reviewLinks } from "./schema";
import { applyChanges, type Writer } from "./state";

type Qualification = "Inclus" | "Hors périmètre" | "À qualifier";
type Quote = { amount: number; days: number; counter: boolean };

export type AgencyAction =
  | { type: "comment.create"; deliverableId: number; id?: number; message: string; location?: string; page?: number; position?: { x: number; y: number }; area?: Area }
  | { type: "request.create"; deliverableId: number; decision: "Inclus" | "Hors périmètre"; title: string; description?: string; quote?: Quote }
  | { type: "comment.restore"; comment: Data }
  | { type: "comment.edit"; commentId: number; message: string }
  | { type: "comment.move"; commentId: number; page: number; x: number; y: number }
  | { type: "comment.delete"; commentId: number }
  | { type: "comment.qualify"; commentId: number; decision: Qualification; title?: string; description?: string; quote?: Quote }
  | { type: "reply.create"; commentId: number; id?: number; message: string }
  | { type: "reply.edit"; commentId: number; replyId: number; message: string }
  | { type: "reply.delete"; commentId: number; replyId: number }
  | { type: "proposal.send"; commentId: number; description: string; amount: number; deadline: number }
  | { type: "proposal.send-draft"; commentId: number }
  | { type: "proposal.version"; commentId: number; send: boolean; description: string; amount: number; deadline: number; allowCounter: boolean }
  | { type: "adaptation.decide"; commentId: number; decision: "accepted" | "refused" }
  | { type: "version.reopen"; deliverableId: number; message: string }
  | { type: "link.share"; deliverableId: number }
  | { type: "link.revoke"; deliverableId: number }
  | { type: "invite.remove"; deliverableId: number; email: string };

export type AgencyMember = { id: string; name: string; organizationId: string; role: string | null | undefined };
export type AgencyActionResult = { ok: true; revision: number; id?: number; data?: Data } | { ok: false; status: number; error: string; code?: string };
export type ActionParams = { commentId?: string; replyId?: string; deliverableId?: string; email?: string };

const refused = (error = "Cette action n’est pas possible sur cette version.", status = 409): AgencyActionResult => ({ ok: false, status, error });

// ——— Reading what the page sends ———

function readQuote(value: unknown): Quote | undefined {
  if (!value || typeof value !== "object") return undefined;
  const quote = value as Data;
  const amount = number(quote.amount, 0, 1e9);
  const days = number(quote.days, 0, 1e5) ?? 0;
  return amount === undefined ? undefined : { amount, days, counter: quote.counter === true };
}

/** The action described by a request body, or null when it is malformed. */
export function readAgencyAction(type: AgencyAction["type"], body: Data, params: ActionParams = {}): AgencyAction | null {
  const commentId = id(Number(params.commentId));
  const deliverableId = id(Number(params.deliverableId));
  const replyId = id(Number(params.replyId));
  const message = text(body.message);
  switch (type) {
    case "comment.create": {
      const deliverableId = id(body.deliverableId);
      const point = readPoint(body.position);
      return deliverableId && message
        ? { type, deliverableId, id: id(body.id), message, location: text(body.location, 200), page: id(body.page), position: point, area: point ? readArea(body.area) : undefined }
        : null;
    }
    case "request.create": {
      const request = body.request && typeof body.request === "object" ? (body.request as Data) : {};
      const deliverableId = id(request.deliverableId);
      const title = text(request.title, 300);
      const decision = request.decision === "Inclus" || request.decision === "Hors périmètre" ? request.decision : null;
      return deliverableId && title && decision ? { type, deliverableId, decision, title, description: text(request.description), quote: readQuote(request.quote) } : null;
    }
    case "comment.restore": {
      const comment = body.restore && typeof body.restore === "object" && !Array.isArray(body.restore) ? (body.restore as Data) : null;
      return comment && id(comment.id) && id(comment.deliverableId) && JSON.stringify(comment).length < 200_000 ? { type, comment } : null;
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
    case "comment.qualify": {
      const decision = body.decision === "Inclus" || body.decision === "Hors périmètre" || body.decision === "À qualifier" ? body.decision : null;
      const title = text(body.title, 300);
      if (!commentId || !decision || (decision !== "À qualifier" && !title)) return null;
      return { type, commentId, decision, title, description: text(body.description), quote: readQuote(body.quote) };
    }
    case "reply.create":
      return commentId && message ? { type, commentId, id: id(body.id), message } : null;
    case "reply.edit":
      return commentId && replyId && message ? { type, commentId, replyId, message } : null;
    case "reply.delete":
      return commentId && replyId ? { type, commentId, replyId } : null;
    case "proposal.send":
    case "proposal.version": {
      const description = text(body.description, 2000);
      const amount = number(body.amount, 0, 1e9);
      const deadline = number(body.deadline, 0, 1e5);
      if (!commentId || !description || amount === undefined || deadline === undefined) return null;
      return type === "proposal.send"
        ? { type, commentId, description, amount, deadline }
        : { type, commentId, send: body.send === true, description, amount, deadline, allowCounter: body.allowCounter === true };
    }
    case "proposal.send-draft":
      return commentId ? { type, commentId } : null;
    case "adaptation.decide":
      return commentId && (body.decision === "accepted" || body.decision === "refused") ? { type, commentId, decision: body.decision } : null;
    case "version.reopen":
      return deliverableId && message ? { type, deliverableId, message } : null;
    case "link.share":
    case "link.revoke":
      return deliverableId ? { type, deliverableId } : null;
    case "invite.remove": {
      const email = text(params.email, 320)?.toLowerCase();
      return deliverableId && email ? { type, deliverableId, email } : null;
    }
  }
}

// ——— Turning an action into changes ———

/** Audit events of one action: distinct ids (several events may share a millisecond). */
function trail(member: AgencyMember, deliverableId: number | null) {
  const stamp = Date.now() * 1000;
  const events: Data[] = [];
  return {
    add(type: string, description: string, commentId?: number) {
      events.push({ id: stamp + events.length, type, actor: member.name, description, timestamp: displayedNow(), ...(commentId ? { commentId } : {}), ...(deliverableId ? { deliverableId } : {}) });
    },
    into(changes: StateChanges) {
      if (events.length) changes.lists.auditEvents = { upsert: events as ListChange["upsert"], remove: [] };
    },
  };
}

/** A draft quote for an out-of-scope request: replaces an earlier draft, keeps the quotes sent before. */
async function draftQuote(db: Db, org: string, changes: StateChanges, commentId: number, description: string, quote: Quote) {
  const [proposal] = await db.select({ state: commentProposals.state }).from(commentProposals).where(and(eq(commentProposals.organizationId, org), eq(commentProposals.commentId, commentId))).limit(1);
  if (proposal?.state === "sent") return false;
  const history = (
    await db.select({ data: proposalVersions.data }).from(proposalVersions).where(and(eq(proposalVersions.organizationId, org), eq(proposalVersions.commentId, commentId))).orderBy(asc(proposalVersions.position))
  )
    .map((row) => row.data as Data)
    .filter((entry) => entry.status !== "draft");
  const draft = {
    id: Date.now(),
    version: Math.max(0, ...history.map((entry) => Number(entry.version) || 0)) + 1,
    commentId,
    description,
    amount: quote.amount,
    deadline: quote.days,
    allowCounter: quote.counter,
    status: "draft",
    createdAt: displayedNow(),
  };
  changes.maps.proposalStates = { upsert: { [String(commentId)]: "draft" }, remove: [] };
  changes.maps.proposalVersions = { upsert: { [String(commentId)]: [...history, draft] }, remove: [] };
  return true;
}

/** The request's proposal (state, client decision, counter-proposal) and its quotes, oldest first. */
async function storedProposal(db: Db, org: string, commentId: number) {
  const [proposal] = await db.select().from(commentProposals).where(and(eq(commentProposals.organizationId, org), eq(commentProposals.commentId, commentId))).limit(1);
  const history = (
    await db.select({ data: proposalVersions.data }).from(proposalVersions).where(and(eq(proposalVersions.organizationId, org), eq(proposalVersions.commentId, commentId))).orderBy(asc(proposalVersions.position))
  ).map((row) => row.data as Data);
  const adaptation = (proposal?.adaptation as Data | null | undefined) ?? null;
  const decision = proposal?.decision && proposal.decision !== "none" ? proposal.decision : null;
  return { state: proposal?.state ?? "none", decision, adaptation, history };
}

const nextVersion = (history: Data[]) => Math.max(0, ...history.map((entry) => Number(entry.version) || 0)) + 1;

/** Quote changes of one request, in the shape the pages write them. */
function quoteChanges(changes: StateChanges, commentId: number, update: { state?: string; decision?: string; history?: Data[]; dropAdaptation?: boolean; adaptation?: Data }) {
  const key = String(commentId);
  if (update.state) changes.maps.proposalStates = { upsert: { [key]: update.state }, remove: [] };
  if (update.decision) changes.maps.proposalDecisions = { upsert: { [key]: update.decision }, remove: [] };
  if (update.history) changes.maps.proposalVersions = { upsert: { [key]: update.history }, remove: [] };
  if (update.adaptation) changes.maps.adaptationRequests = { upsert: { [key]: update.adaptation }, remove: [] };
  else if (update.dropAdaptation) changes.maps.adaptationRequests = { upsert: {}, remove: [key] };
}

const scopeLabel = (decision: "Inclus" | "Hors périmètre") => (decision === "Inclus" ? "À traiter" : "Hors scope");

/** A new client link for a version: a random token, valid 7 days unless the agency says otherwise. */
function newReviewLink(deliverableId: number, version: number) {
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" });
  return { token: randomUUID(), active: true, expiresAt, autoExpire: true, deliverableId, version };
}

/** Actions on a version: its validation and its client link (one per version, keyed "id:version"). */
async function versionChanges(db: Db, member: AgencyMember, action: Extract<AgencyAction, { deliverableId: number; type: "version.reopen" | "link.share" | "link.revoke" | "invite.remove" }>) {
  const org = member.organizationId;
  const changes = noChanges();
  const [record] = await db.select().from(deliverables).where(and(eq(deliverables.organizationId, org), eq(deliverables.id, action.deliverableId))).limit(1);
  if (!record || record.version === null) return refused("Livrable introuvable.", 404);
  const key = `${record.id}:${record.version}`;
  const [stored] = await db.select().from(reviewLinks).where(and(eq(reviewLinks.organizationId, org), eq(reviewLinks.key, key))).limit(1);
  const link = stored?.data as Data | undefined;
  const log = trail(member, record.id);
  const putLink = (value: Data) => {
    changes.maps.reviewLinks = { upsert: { [key]: value }, remove: [] };
  };

  switch (action.type) {
    case "version.reopen":
      changes.lists.deliverables = { upsert: [{ ...(record.data as Data), id: record.id, reviewStatus: "changes-requested" }], remove: [] };
      log.add("review.reopened", `Validation rouverte par l’agence : « ${action.message} »`);
      break;
    case "link.share": {
      // The active link is kept; a revoked one is replaced by a new one (new token, no invitation).
      if (stored?.active) return { changes, data: { link } };
      const created = newReviewLink(record.id, record.version);
      putLink(created);
      log.into(changes);
      return { changes, data: { link: created } };
    }
    case "link.revoke":
      if (!stored?.active) return refused("Ce lien n’est pas actif.");
      putLink({ ...link, active: false });
      log.add("review-link.revoked", "Lien de revue révoqué");
      break;
    case "invite.remove": {
      const invites = Array.isArray(link?.invites) ? (link.invites as Data[]) : [];
      if (!link || !invites.some((invite) => invite.email === action.email)) return refused("Invitation introuvable.", 404);
      putLink({ ...link, invites: invites.filter((invite) => invite.email !== action.email) });
      log.add("review-link.invite-removed", `Invitation retirée : ${action.email}`);
      break;
    }
  }
  log.into(changes);
  return { changes };
}

async function changesFor(db: Db, member: AgencyMember, action: AgencyAction): Promise<{ changes: StateChanges; id?: number; data?: Data } | AgencyActionResult> {
  if (action.type === "version.reopen" || action.type === "link.share" || action.type === "link.revoke" || action.type === "invite.remove") return versionChanges(db, member, action);
  const org = member.organizationId;
  const changes = noChanges();
  const signer = { author: member.name, initials: initialsOf(member.name), from: "agency" };
  const upsertComment = (comment: Data) => {
    changes.lists.comments = { upsert: [comment as ListChange["upsert"][number]], remove: [] };
  };

  if (action.type === "comment.create" || action.type === "request.create" || action.type === "comment.restore") {
    const deliverableId = action.type === "comment.restore" ? (action.comment.deliverableId as number) : action.deliverableId;
    const [version] = await db.select({ id: deliverables.id }).from(deliverables).where(and(eq(deliverables.organizationId, org), eq(deliverables.id, deliverableId))).limit(1);
    if (!version) return refused("Livrable introuvable.", 404);
    if (await versionClosed(db, org, deliverableId)) return refused();
    const log = trail(member, deliverableId);

    if (action.type === "comment.restore") {
      // Put back right after its deletion ("Annuler"): as it was, under its own id.
      const restoredId = action.comment.id as number;
      if ((await freeCommentId(db, org, restoredId)) !== restoredId) return refused("Ce commentaire existe déjà.");
      if (sideOf(action.comment) !== "agency") return refused();
      upsertComment(action.comment);
      log.add("comment.restored", "Commentaire agence restauré", restoredId);
      log.into(changes);
      return { changes, id: restoredId };
    }

    const commentId = await freeCommentId(db, org, action.type === "comment.create" ? action.id : undefined);
    const base = { id: commentId, deliverableId, ...signer, time: "À l'instant", createdAt: Date.now() };
    if (action.type === "comment.create") {
      upsertComment({
        ...base,
        message: action.message,
        location: action.location ?? "Livrable (général)",
        decision: "À qualifier",
        kind: "remark",
        page: action.page ?? 1,
        ...(action.position ? { position: action.position } : {}),
        ...(action.area ? { area: action.area } : {}),
      });
      log.add("comment.created", "Commentaire agence ajouté", commentId);
    } else {
      upsertComment({
        ...base,
        message: action.description || action.title,
        location: "Livrable (général)",
        decision: action.decision,
        kind: "request",
        title: action.title,
        ...(action.description ? { description: action.description } : {}),
        page: 1,
      });
      log.add("scope.classified", `Demande créée « ${scopeLabel(action.decision)} » : ${action.title}`, commentId);
      if (action.quote && action.decision === "Hors périmètre" && (await draftQuote(db, org, changes, commentId, action.title, action.quote)))
        log.add("proposal.drafted", `Chiffrage préparé : ${action.quote.amount} € · ${action.quote.days} j`, commentId);
    }
    log.into(changes);
    return { changes, id: commentId };
  }

  // The others change a stored comment, on a version still open.
  const stored = await storedComment(db, org, action.commentId);
  if (!stored) return refused("Commentaire introuvable.", 404);
  if (await versionClosed(db, org, stored.deliverableId)) return refused();
  const comment = stored.data;
  const replies = Array.isArray(comment.replies) ? (comment.replies as Data[]) : [];
  const log = trail(member, stored.deliverableId);
  const ownComment = sideOf(comment) === "agency";
  const settled = () => decisionLocked(db, org, action.commentId);

  switch (action.type) {
    case "comment.edit":
      if (!ownComment) return refused();
      upsertComment({ ...comment, message: action.message, edited: true });
      break;
    case "comment.move": {
      const moved = movedComment(comment, action.page, action.x, action.y);
      if (!moved) return refused();
      upsertComment(moved);
      break;
    }
    case "comment.delete":
      if (!ownComment || (await settled())) return refused();
      changes.lists.comments = { upsert: [], remove: [action.commentId] };
      log.add("comment.deleted", "Commentaire agence supprimé", action.commentId);
      break;
    case "comment.qualify": {
      if (await settled()) return refused();
      if (action.decision === "À qualifier") {
        upsertComment({ ...comment, decision: "À qualifier", kind: "remark" });
        log.add("scope.classified", "Demande remise à clarifier", action.commentId);
        break;
      }
      // The description is the one given now (none removes the earlier one), as the page did.
      const rest = { ...comment };
      delete rest.description;
      upsertComment({ ...rest, decision: action.decision, kind: "request", title: action.title, ...(action.description ? { description: action.description } : {}) });
      log.add("scope.classified", `Demande qualifiée « ${scopeLabel(action.decision)} » : ${action.title}`, action.commentId);
      if (action.quote && action.decision === "Hors périmètre" && (await draftQuote(db, org, changes, action.commentId, action.title!, action.quote)))
        log.add("proposal.drafted", `Chiffrage préparé : ${action.quote.amount} € · ${action.quote.days} j`, action.commentId);
      break;
    }
    case "reply.create": {
      if (await settled()) return refused();
      const taken = new Set(replies.map((reply) => reply.id));
      const replyId = action.id && !taken.has(action.id) ? action.id : Math.max(Date.now(), ...replies.map((reply) => Number(reply.id) + 1 || 0));
      upsertComment({ ...comment, replies: [...replies, { id: replyId, ...signer, message: action.message, time: "À l'instant", createdAt: Date.now() }] });
      log.add("reply.created", "Réponse agence ajoutée", action.commentId);
      log.into(changes);
      return { changes, id: replyId };
    }
    case "proposal.send":
    case "proposal.send-draft":
    case "proposal.version":
    case "adaptation.decide": {
      if (comment.decision !== "Hors périmètre") return refused("Seule une demande hors scope se chiffre.");
      const proposal = await storedProposal(db, org, action.commentId);
      const pendingAdaptation = Boolean(proposal.adaptation) && !proposal.adaptation?.decision;
      const now = displayedNow();

      if (action.type === "proposal.send") {
        // First quote, written in the proposal window; an existing history is kept as it is.
        if (proposal.state === "sent") return refused("Une proposition est déjà envoyée.");
        const history = proposal.history.some((entry) => entry.status !== "draft")
          ? proposal.history
          : [{ id: Date.now(), version: 1, commentId: action.commentId, description: action.description, amount: action.amount, deadline: action.deadline, status: "sent", createdAt: now }];
        quoteChanges(changes, action.commentId, { state: "sent", history });
        log.add("proposal.sent", "Proposition envoyée au client", action.commentId);
      } else if (action.type === "proposal.send-draft") {
        const draft = proposal.history.find((entry) => entry.status === "draft");
        if (!draft) return refused("Aucun chiffrage à envoyer.");
        const history = proposal.history.map((entry) => (entry === draft ? { ...entry, status: "sent", createdAt: now } : entry));
        quoteChanges(changes, action.commentId, { state: "sent", decision: "none", history });
        log.add("proposal.sent", `Proposition envoyée au client : ${formatProposalAmount(draft.amount as number)} · ${formatProposalDeadline(draft.deadline as number)}`, action.commentId);
      } else if (action.type === "proposal.version") {
        const version = nextVersion(proposal.history);
        const quote = { id: Date.now(), version, commentId: action.commentId, description: action.description, amount: action.amount, deadline: action.deadline, allowCounter: action.allowCounter, createdAt: now };
        if (action.send) {
          // Replaces the quote waiting for the client (or answers their counter-proposal).
          if (proposal.state !== "sent" || proposal.decision || proposal.adaptation?.decision) return refused();
          const history = [...proposal.history.map((entry) => (entry.status === "sent" ? { ...entry, status: "superseded" } : entry)), { ...quote, status: "sent" }];
          quoteChanges(changes, action.commentId, { state: "sent", decision: "none", history, dropAdaptation: Boolean(proposal.adaptation) });
          log.add("proposal.sent", `Nouvelle proposition v${version} envoyée`, action.commentId);
        } else {
          // After a refusal (of the quote, or of the counter-proposal): the new quote waits to be sent.
          if (proposal.decision !== "refused" && proposal.adaptation?.decision !== "refused") return refused();
          const message = proposal.adaptation?.message;
          const history = [
            ...proposal.history.filter((entry) => entry.status !== "draft").map((entry) => (entry.status === "sent" ? { ...entry, status: "refused", adaptation: message } : entry)),
            { ...quote, status: "draft" },
          ];
          quoteChanges(changes, action.commentId, { state: "draft", decision: "none", history, dropAdaptation: Boolean(proposal.adaptation) });
          log.add("proposal.drafted", `Nouveau chiffrage v${version} après refus`, action.commentId);
        }
      } else {
        if (!pendingAdaptation || proposal.state !== "sent") return refused("Aucune contre-proposition en attente.");
        quoteChanges(changes, action.commentId, { adaptation: { ...proposal.adaptation, decision: action.decision, decisionBy: member.name, decisionAt: now } });
        log.add("proposal.adaptation-decision", `Demande d'adaptation ${action.decision === "accepted" ? "acceptée" : "refusée"}`, action.commentId);
      }
      break;
    }
    case "reply.edit":
    case "reply.delete": {
      const reply = replies.find((candidate) => candidate.id === action.replyId);
      if (!reply) return refused("Message introuvable.", 404);
      if (sideOf(reply) !== "agency") return refused();
      upsertComment({
        ...comment,
        replies:
          action.type === "reply.edit"
            ? replies.map((candidate) => (candidate.id === action.replyId ? { ...candidate, message: action.message, edited: true } : candidate))
            : replies.filter((candidate) => candidate.id !== action.replyId),
      });
      break;
    }
  }
  log.into(changes);
  return { changes, id: action.commentId };
}

/** Runs one action of a member: refused whole when it holds a decision reserved to administrators. */
export async function runAgencyAction(db: Db, member: AgencyMember, writer: Omit<Writer, "recordedBy">, action: AgencyAction): Promise<AgencyActionResult> {
  const built = await changesFor(db, member, action);
  if ("ok" in built) return built;
  if (!canManageAgency(member.role)) {
    const reserved = await reservedActions(db, member.organizationId, built.changes);
    if (reserved.length) return { ok: false, status: 403, error: `Réservé aux administrateurs de l’agence : ${reserved.join(", ")}.`, code: "ADMIN_ONLY" };
  }
  const { revision } = await applyChanges(db, member.organizationId, built.changes, { recordedBy: member.id, ...writer });
  return { ok: true, revision, ...(built.id ? { id: built.id } : {}), ...(built.data ? { data: built.data } : {}) };
}
