// Where an out-of-scope request stands, one status for the agency and its equivalent for the client,
// shown on its card and used to filter. Shared by the agency's panel and the client's page.
//
// The client never learns that a quote is being prepared: « Chiffrée » and « À chiffrer » are the same
// « En cours de chiffrage » for them (the draft's amount never leaves the server, src/db/reviewAccess.ts).

export type OutsideStatus = "unquoted" | "quoted" | "sent" | "counter" | "accepted" | "refused";
export type StatusTone = "pending" | "ready" | "waiting" | "attention" | "accepted" | "refused";

export const outsideStatuses: OutsideStatus[] = ["unquoted", "quoted", "sent", "counter", "accepted", "refused"];

const agencyLabels: Record<OutsideStatus, string> = {
  unquoted: "À chiffrer",
  quoted: "Proposition prête",
  sent: "En attente du client",
  counter: "Contre-proposition reçue",
  accepted: "Acceptée",
  refused: "Refusée",
};
const clientLabels: Record<OutsideStatus, string> = {
  unquoted: "En cours de chiffrage",
  quoted: "En cours de chiffrage",
  sent: "Proposition à décider",
  counter: "Contre-proposition envoyée",
  accepted: "Acceptée",
  refused: "Refusée",
};
const tones: Record<OutsideStatus, StatusTone> = {
  unquoted: "pending",
  quoted: "ready",
  sent: "waiting",
  counter: "attention",
  accepted: "accepted",
  refused: "refused",
};

/** What the reader sees: its label and its tone. */
export function outsideStatusView(status: OutsideStatus, reader: "agency" | "client") {
  return { status, label: (reader === "agency" ? agencyLabels : clientLabels)[status], tone: tones[status] };
}

/** The statuses one reader can tell apart (the client sees no difference between unquoted and quoted). */
export const outsideFilters = (reader: "agency" | "client") => (reader === "agency" ? outsideStatuses : outsideStatuses.filter((status) => status !== "quoted"));

/**
 * From the proposal's state: not quoted, a draft, or sent; then the client's decision on the proposal,
 * and on the adaptation they asked for (a counter-proposal), when there is one.
 */
export function outsideStatusOf({
  state,
  decision,
  adaptation,
}: {
  state: "none" | "draft" | "sent";
  decision: "none" | "accepted" | "refused";
  adaptation?: { decision?: "accepted" | "refused" } | null;
}): OutsideStatus {
  if (state === "none") return "unquoted";
  if (state === "draft") return "quoted";
  if (decision === "accepted" || adaptation?.decision === "accepted") return "accepted";
  if (decision === "refused" || adaptation?.decision === "refused") return "refused";
  if (adaptation) return "counter";
  return "sent";
}
