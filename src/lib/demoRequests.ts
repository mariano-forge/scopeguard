// A demo request from the public landing page (/decouvrir): read and checked here, then mailed to
// the team (DEMO_REQUESTS_TO), with the person as "Répondre à" so an answer reaches them directly.

import "server-only";
import { sendMail } from "./mail";
import { renderMail } from "./mailTemplates";

export type DemoRequest = {
  name: string;
  email: string;
  agency: string;
  message: string;
  /** The hidden "website" field was filled: a bot, told "ok" and ignored. */
  trap: boolean;
};

const text = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The fields of the form, or what is wrong with them (shown to the person as is). */
export function readDemoRequest(body: Record<string, unknown>): { ok: true; value: DemoRequest } | { ok: false; error: string } {
  const name = text(body.name, 100);
  const email = text(body.email, 200).toLowerCase();
  if (!name) return { ok: false, error: "Indiquez votre nom." };
  if (!emailPattern.test(email)) return { ok: false, error: "Indiquez une adresse e-mail valide." };
  return { ok: true, value: { name, email, agency: text(body.agency, 100), message: text(body.message, 1000), trap: text(body.website, 10) !== "" } };
}

/** Where demo requests go: DEMO_REQUESTS_TO, else the address answers go to. Empty when neither is set. */
export const demoRequestsTo = () => process.env.DEMO_REQUESTS_TO || process.env.MAIL_REPLY_TO || "";

export async function sendDemoRequest(request: DemoRequest, to: string, origin: { ipAddress: string | null; userAgent: string | null }) {
  const who = request.agency ? `${request.name} (${request.agency})` : request.name;
  return sendMail({
    to,
    subject: `Demande de démo : ${who}`,
    replyTo: request.email,
    ...renderMail({
      preheader: `${who} souhaite voir Kora`,
      heading: "Nouvelle demande de démo",
      paragraphs: [
        `${who} · ${request.email}`,
        request.message || "Sans message.",
        `Envoyée depuis ${origin.ipAddress ?? "une adresse inconnue"}${origin.userAgent ? ` · ${origin.userAgent}` : ""}.`,
      ],
      footer: "Vous recevez cet e-mail parce que votre adresse reçoit les demandes de démo de Kora (DEMO_REQUESTS_TO). Répondez directement : votre réponse part à cette personne.",
    }),
  });
}
