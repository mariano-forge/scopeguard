// An out-of-scope request the agency offers the client (US-046): done for free, as a commercial gesture,
// valued like a quote so that what is given is measured. One of the two ways to answer an out-of-scope
// request, beside a paid quote: chosen when the proposal is prepared (« Préparer la proposition » :
// « Facturer » or « Offrir »), sent like one (« Envoyer la proposition »). Decided with the product owner on
// 24 October 2026: the value is required; until sent, the offer is the agency's draft and the client sees
// nothing of it; sent, the client sees « Offerte » and its value, is told by e-mail, and has nothing to
// decide. Taken back, the request is to answer again; each step is in the journal. Kept on the request
// itself (`offer`), written by the server only (src/db/agencyActions.ts).

import { formatProposalAmount, formatProposalDeadline } from "./proposalFormat";

export type RequestOffer = {
  /** What the work is worth, in euros excluding tax. */
  amount: number;
  /** Its delay in days (0: none). */
  days: number;
  /** When it was sent to the client: none, the agency's draft. */
  sentAt?: number;
  /** The member who sent it: the agency's, never sent to the client (src/db/reviewAccess.ts). */
  sentBy?: string;
};

/** The request's offer, sent or not, when it has a well-formed one (any request: the pages' types do not all name it). */
export function offerOf(request: object): RequestOffer | null {
  const offer = "offer" in request ? request.offer : undefined;
  if (!offer || typeof offer !== "object") return null;
  const { amount, days, sentAt, sentBy } = offer as Record<string, unknown>;
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) return null;
  return {
    amount,
    days: typeof days === "number" && Number.isFinite(days) && days > 0 ? days : 0,
    ...(typeof sentAt === "number" ? { sentAt } : {}),
    ...(typeof sentBy === "string" ? { sentBy } : {}),
  };
}

/** The offer the client was sent: the only one they see, and the only one counted as given. */
export const sentOfferOf = (request: object) => {
  const offer = offerOf(request);
  return offer?.sentAt ? offer : null;
};

/** « 450 € · + 2 jours », or the amount alone without a delay. */
export const offerValue = (offer: Pick<RequestOffer, "amount" | "days">) =>
  offer.days ? `${formatProposalAmount(offer.amount)} · ${formatProposalDeadline(offer.days)}` : formatProposalAmount(offer.amount);
