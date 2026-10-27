// Where an out-of-scope request stands, one status for the agency and its equivalent for the client,
// shown on its card and used to filter. Shared by the agency's panel and the client's page.
//
// The client never learns that a quote is being prepared: before a proposal is sent, their card shows no
// status at all (the draft's amount never leaves the server, src/db/reviewAccess.ts). A proposal waiting
// for them is « À valider », in the tone the agency gives to what is still to be done.

//
// An offered request (src/lib/requestOffer.ts) is « Offerte » for both: done for free, nothing to decide.

export type OutsideStatus = "unquoted" | "quoted" | "sent" | "counter" | "accepted" | "refused" | "offered";
export type StatusTone = "pending" | "ready" | "waiting" | "attention" | "accepted" | "refused";

export const outsideStatuses: OutsideStatus[] = ["unquoted", "quoted", "sent", "counter", "accepted", "refused", "offered"];

const agencyLabels: Record<OutsideStatus, string> = {
  unquoted: "À chiffrer",
  quoted: "Prête pour l’envoi",
  sent: "En attente du client",
  counter: "Contre-proposition reçue",
  accepted: "Acceptée",
  refused: "Refusée",
  offered: "Offerte",
};
const clientLabels: Record<OutsideStatus, string | null> = {
  unquoted: null,
  quoted: null,
  sent: "À valider",
  counter: "Contre-proposition envoyée",
  accepted: "Acceptée",
  refused: "Refusée",
  offered: "Offerte",
};
const tones: Record<OutsideStatus, StatusTone> = {
  unquoted: "pending",
  quoted: "ready",
  sent: "waiting",
  counter: "attention",
  accepted: "accepted",
  refused: "refused",
  offered: "accepted",
};

const clientTones: Partial<Record<OutsideStatus, StatusTone>> = { sent: "pending" };

/** What the reader sees: its label (none for the client before a proposal) and its tone. */
export function outsideStatusView(status: OutsideStatus, reader: "agency" | "client") {
  if (reader === "agency") return { status, label: agencyLabels[status], tone: tones[status] };
  return { status, label: clientLabels[status], tone: clientTones[status] ?? tones[status] };
}

/** The statuses one reader can filter by (the client's start once a proposal is sent). */
export const outsideFilters = (reader: "agency" | "client") => (reader === "agency" ? outsideStatuses : outsideStatuses.filter((status) => clientLabels[status] !== null));

/**
 * Offered first (whatever quote came before it); otherwise from the proposal's state: not quoted, a draft,
 * or sent; then the client's decision on the proposal, and on the adaptation they asked for (a
 * counter-proposal), when there is one.
 */
export function outsideStatusOf({
  state,
  decision,
  adaptation,
  offered = false,
}: {
  state: "none" | "draft" | "sent";
  decision: "none" | "accepted" | "refused";
  adaptation?: { decision?: "accepted" | "refused" } | null;
  offered?: boolean;
}): OutsideStatus {
  if (offered) return "offered";
  if (state === "none") return "unquoted";
  if (state === "draft") return "quoted";
  if (decision === "accepted" || adaptation?.decision === "accepted") return "accepted";
  if (decision === "refused" || adaptation?.decision === "refused") return "refused";
  if (adaptation) return "counter";
  return "sent";
}
