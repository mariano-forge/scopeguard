// The « Demandes » tab of a project (ProjectRequests.tsx): every request of its deliverables as a card, in
// the column of where it stands, from the agency's draft to the proposal accepted (decided 25 October 2026).
// A view of what the editor decides: a card moves when the request changes there, never by itself here.
// « Marquer comme payée » is ready on the server (src/db/agencyActions.ts « proposal.paid ») but not shown
// for now (feedback of 25 October 2026).

import type { OutsideStatus } from "@/lib/outsideStatus";
import type { CardAmount } from "./editor/requestCard";
import type { TrackingInput } from "./ProjectTracking";
import { isAgencyDraft } from "./editor/CanvasComments";

export type BoardColumn = "draft" | "clarify" | "included" | "unquoted" | "quoted" | "sent" | "counter" | "accepted" | "offered" | "closed";

export const boardColumns: { key: BoardColumn; label: string; hint: string }[] = [
  { key: "draft", label: "Brouillon", hint: "Vos repères pas encore qualifiés : le client ne les voit pas." },
  { key: "clarify", label: "À clarifier", hint: "Demandes à qualifier, ou à préciser avec le client." },
  { key: "included", label: "Inclus", hint: "Prévu au devis : à faire dans la version." },
  { key: "unquoted", label: "Hors scope à chiffrer", hint: "Hors scope, sans proposition préparée." },
  { key: "quoted", label: "Chiffrée", hint: "Proposition préparée (devis ou offre), pas encore envoyée." },
  { key: "sent", label: "Envoyée", hint: "En attente de la décision du client." },
  { key: "counter", label: "Contre-proposition", hint: "Le client propose une adaptation : à vous de répondre." },
  { key: "accepted", label: "Acceptée", hint: "Acceptée par le client : à réaliser et à facturer." },
  { key: "offered", label: "Offerte", hint: "Faite gratuitement, sa valeur montrée au client." },
  { key: "closed", label: "Clôturée", hint: "Discussions closes et propositions refusées." },
];

/** A request as the board reads it: what the tracking reads, and its words. */
export type BoardRequest = TrackingInput["requests"][number] & {
  title?: string;
  message: string;
  author: string;
  decision: string;
  closed?: boolean;
};
/** `amountOf`: a card's amount, offered or quoted, as the editor's panel says it (EditorInspector.tsx). */
export type BoardInput = Omit<TrackingInput, "requests"> & { requests: BoardRequest[]; amountOf?: (request: BoardRequest) => CardAmount | null };

/**
 * Its column. A proposal sent, answered, accepted or offered keeps its column even once the discussion is
 * closed (it is followed up to its payment); a refused one is done, as a closed discussion is.
 */
export function columnOf(request: BoardRequest, status: OutsideStatus): BoardColumn {
  if (isAgencyDraft(request)) return "draft";
  if (request.decision === "Hors périmètre") {
    if (status === "refused") return "closed";
    if (status === "accepted" || status === "offered" || status === "sent" || status === "counter") return status;
    return request.closed ? "closed" : status;
  }
  if (request.closed) return "closed";
  return request.decision === "Inclus" ? "included" : "clarify";
}
