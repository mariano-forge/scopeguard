// What an invited client may do on a review. Decisions that commit the client (a quote, a counter-
// proposal, approving or asking changes) belong to deciders; contributors read, comment and reply.
// Shared by the server, which enforces it, and the pages, which show it.

export type ClientRole = "decider" | "contributor";

export const clientRoleLabels: Record<ClientRole, string> = { decider: "Décideur", contributor: "Contributeur" };

/** An invitation's role. Invitations made before roles existed keep deciding. */
export const roleOfInvite = (invite: { role?: unknown } | undefined): ClientRole => (invite?.role === "contributor" ? "contributor" : "decider");

export const readClientRole = (value: unknown): ClientRole | null => (value === "decider" || value === "contributor" ? value : null);

/** Client actions reserved to deciders (src/db/reviewActions.ts). */
export const deciderActions = new Set(["proposal.decide", "proposal.adapt", "version.approve", "version.request-changes"]);

/** Audit events of those decisions, for the proof. */
export const deciderEventTypes = new Set(["proposal.decision", "proposal.adaptation-requested", "deliverable.approved", "review.changes-requested"]);
