// E-mails about quotes and decisions, so nobody has to watch the app to know:
//   - to the client's deciders when the agency sends a quote or answers their counter-proposal;
//   - to the agency's owner and administrators when the client decides a quote, makes a
//     counter-proposal, validates the version or asks for changes.
// Sent after the action is recorded: a mail that fails is logged and never undoes the action (the
// bell's notification is there anyway).

import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { roleOfInvite } from "@/lib/clientRoles";
import { linkDeciders } from "@/lib/linkDeciders";
import { sendMail } from "@/lib/mail";
import { renderMail } from "@/lib/mailTemplates";
import { formatProposalAmount, formatProposalDeadline } from "@/lib/proposalFormat";
import type { Db } from "./client";
import { agencyHref, managersOf, memberEmail, reviewUrl } from "./mailTargets";
import { expired, type ReviewAccess } from "./reviewAccess";
import { invitesOf, reviewedDeliverableName, reviewProfileName } from "./reviewAuth";
import { commentProposals, comments, deliverables, proposalVersions, reviewLinks } from "./schema";

type Data = Record<string, unknown>;

const send = (mail: Parameters<typeof sendMail>[0]) => sendMail(mail).catch((error) => (console.error("[review mail]", error), false));

/** A request of the agency: its title (or words), and the last quote sent on it. */
async function requestAndQuote(db: Db, org: string, commentId: number) {
  const [comment] = await db.select({ deliverableId: comments.deliverableId, data: comments.data }).from(comments).where(and(eq(comments.organizationId, org), eq(comments.id, commentId))).limit(1);
  const quotes = (
    await db.select({ data: proposalVersions.data }).from(proposalVersions).where(and(eq(proposalVersions.organizationId, org), eq(proposalVersions.commentId, commentId))).orderBy(desc(proposalVersions.position))
  ).map((row) => row.data as Data);
  const data = (comment?.data ?? {}) as Data;
  return {
    deliverableId: comment?.deliverableId ?? null,
    title: String(data.title ?? data.message ?? "Demande"),
    quote: quotes.find((quote) => quote.status !== "draft") ?? null,
  };
}

const priceLine = (quote: Data | null) => (quote ? `${formatProposalAmount(quote.amount as number)} HT · ${formatProposalDeadline(quote.deadline as number)}` : "");

// ——— Client → agency ———

export type ClientDecision =
  | { type: "proposal.decide"; commentId: number; decision: "accepted" | "refused" }
  | { type: "proposal.adapt"; commentId: number; message: string; budget?: number; deadline?: number }
  | { type: "version.approve" }
  | { type: "version.request-changes"; message: string };

/** Tells the agency's owner and administrators what the client decided. */
export async function mailClientDecision(db: Db, access: ReviewAccess, email: string, decision: ClientDecision) {
  const org = access.organizationId;
  const managers = await managersOf(db, org);
  if (!managers.length) return;
  const client = (await reviewProfileName(db, email)) ?? email;
  const deliverable = await reviewedDeliverableName(db, access);
  const version = `V${String(access.version).padStart(2, "0")}`;
  let mail: { subject: string; heading: string; paragraphs: string[]; label: string; href: string };

  if (decision.type === "proposal.decide" || decision.type === "proposal.adapt") {
    const { title, quote } = await requestAndQuote(db, org, decision.commentId);
    const href = await agencyHref(db, org, access.deliverableId, { commentId: decision.commentId });
    if (decision.type === "proposal.decide") {
      const accepted = decision.decision === "accepted";
      mail = {
        subject: `${accepted ? "Devis accepté" : "Devis refusé"} : « ${title} »`,
        heading: accepted ? "Devis accepté, à planifier" : "Devis refusé",
        paragraphs: [
          `${client} a ${accepted ? "accepté" : "refusé"} la proposition « ${title} » sur « ${deliverable} » (${version}).`,
          ...(quote ? [priceLine(quote)] : []),
          accepted ? "Le travail est convenu : vous pouvez le planifier." : "Vous pouvez faire une nouvelle proposition depuis la demande.",
        ],
        label: "Voir la demande",
        href,
      };
    } else {
      const target = [
        decision.budget !== undefined ? `budget visé ${formatProposalAmount(decision.budget)} HT` : null,
        decision.deadline !== undefined ? `délai visé ${formatProposalDeadline(decision.deadline)}` : null,
      ].filter(Boolean);
      mail = {
        subject: `Contre-proposition sur « ${title} »`,
        heading: "Le client propose une adaptation",
        paragraphs: [
          `${client} demande une adaptation de la proposition « ${title} » sur « ${deliverable} » (${version}).`,
          `Son message : « ${decision.message} »`,
          ...(target.length ? [target.join(" · ").replace(/^./, (first) => first.toUpperCase())] : []),
          "Répondez depuis la demande : accepter, refuser, ou envoyer une nouvelle version.",
        ],
        label: "Répondre à la contre-proposition",
        href,
      };
    }
  } else {
    const href = await agencyHref(db, org, access.deliverableId);
    mail =
      decision.type === "version.approve"
        ? {
            subject: `« ${deliverable} » ${version} validée par le client`,
            heading: "Version validée",
            paragraphs: [`${client} a validé la version ${access.version} de « ${deliverable} ». Elle est désormais verrouillée.`],
            label: "Voir la version",
            href,
          }
        : {
            subject: `Modifications demandées sur « ${deliverable} » ${version}`,
            heading: "Le client demande des modifications",
            paragraphs: [`${client} demande des modifications sur la version ${access.version} de « ${deliverable} ».`, `Son message : « ${decision.message} »`],
            label: "Voir la version",
            href,
          };
  }

  for (const manager of managers)
    await send({
      to: manager,
      subject: mail.subject,
      replyTo: email,
      ...renderMail({
        preheader: mail.paragraphs[0],
        heading: mail.heading,
        paragraphs: mail.paragraphs,
        action: { label: mail.label, href: mail.href },
        footer: `Vous recevez cet e-mail parce que vous êtes propriétaire ou administrateur de l’organisation sur Kora. Répondre à cet e-mail écrit à ${email}.`,
      }),
    });
}

// ——— Agency → client ———

/** `offered`: an offer sent (src/lib/requestOffer.ts), with its value: the client is told, with nothing to decide. */
export type AgencyQuoteEvent = { type: "sent" } | { type: "offered"; amount: number; days: number } | { type: "adaptation"; decision: "accepted" | "refused" };

/** The deciders invited on the shared version of a deliverable: those a proposal goes to (none when its link is off). */
export async function versionDeciders(db: Db, org: string, deliverableId: number) {
  const [record] = await db.select({ version: deliverables.version }).from(deliverables).where(and(eq(deliverables.organizationId, org), eq(deliverables.id, deliverableId))).limit(1);
  if (!record) return [];
  const [row] = await db.select().from(reviewLinks).where(and(eq(reviewLinks.organizationId, org), eq(reviewLinks.key, `${deliverableId}:${record.version}`))).limit(1);
  return row?.active ? linkDeciders(row.data as Data) : [];
}

/**
 * Tells the client's deciders on the request's version that a quote was sent, or their counter-proposal answered.
 * `notify`: those the agency chose to tell (all when absent); an address that is not a decider's is ignored.
 */
export async function mailQuoteToClient(db: Db, org: string, actor: { id: string; name: string }, commentId: number, event: AgencyQuoteEvent, notify?: string[]) {
  const { deliverableId, title, quote } = await requestAndQuote(db, org, commentId);
  if (deliverableId === null) return;
  const [record] = await db.select({ version: deliverables.version, name: deliverables.name }).from(deliverables).where(and(eq(deliverables.organizationId, org), eq(deliverables.id, deliverableId))).limit(1);
  if (!record) return;
  const [row] = await db.select().from(reviewLinks).where(and(eq(reviewLinks.organizationId, org), eq(reviewLinks.key, `${deliverableId}:${record.version}`))).limit(1);
  const link = row?.data as Data | undefined;
  if (!row?.active || !link || link.active !== true || expired(link)) return;
  // Contributors do not decide quotes: only deciders are asked.
  const chosen = notify ? new Set(notify.map((email) => email.trim().toLowerCase())) : null;
  const deciders = invitesOf(link).filter((invite) => roleOfInvite(invite) === "decider" && (!chosen || chosen.has(invite.email.toLowerCase())));
  if (!deciders.length) return;
  const replyTo = await memberEmail(db, actor.id);
  const [proposal] = await db.select({ adaptation: commentProposals.adaptation }).from(commentProposals).where(and(eq(commentProposals.organizationId, org), eq(commentProposals.commentId, commentId))).limit(1);
  const counterMessage = ((proposal?.adaptation as Data | null)?.message as string | undefined) ?? "";

  const content =
    event.type === "sent"
      ? {
          subject: `Proposition : « ${title} » · ${formatProposalAmount(quote?.amount as number)} HT`,
          heading: "Une proposition attend votre décision",
          paragraphs: [
            `${actor.name} vous propose « ${title} », sur « ${record.name} » (version ${record.version}).`,
            ...(quote?.description && quote.description !== title ? [String(quote.description)] : []),
            priceLine(quote),
            quote?.allowCounter
              ? "Vous pouvez l’accepter, la refuser ou faire une contre-proposition depuis la revue."
              : "Vous pouvez l’accepter ou la refuser depuis la revue.",
          ],
        }
      : event.type === "offered"
        ? {
            subject: `Offert : « ${title} »`,
            heading: "L’organisation vous offre cette demande",
            paragraphs: [
              `${actor.name} vous offre « ${title} », sur « ${record.name} » (version ${record.version}) : elle est faite sans vous être facturée.`,
              `Valeur : ${formatProposalAmount(event.amount)} HT${event.days ? ` · délai ${formatProposalDeadline(event.days)}` : ""}.`,
              "Vous n’avez rien à décider : la demande apparaît « Offerte » dans votre revue.",
            ],
          }
      : event.decision === "accepted"
        ? {
            subject: `Contre-proposition acceptée : « ${title} »`,
            heading: "Votre contre-proposition est acceptée",
            paragraphs: [`${actor.name} accepte votre contre-proposition sur « ${title} ».`, ...(counterMessage ? [`Votre demande : « ${counterMessage} »`] : [])],
          }
        : {
            subject: `Contre-proposition non retenue : « ${title} »`,
            heading: "Votre contre-proposition n’est pas retenue",
            paragraphs: [`${actor.name} ne retient pas votre contre-proposition sur « ${title} ». L’organisation pourra vous faire une nouvelle proposition.`],
          };

  for (const invite of deciders)
    await send({
      to: invite.email,
      subject: content.subject,
      replyTo: replyTo ?? undefined,
      ...renderMail({
        preheader: content.paragraphs[0],
        heading: content.heading,
        paragraphs: content.paragraphs.filter(Boolean),
        action: { label: event.type === "sent" ? "Voir la proposition" : "Ouvrir la revue", href: reviewUrl(link, invite.id) },
        footer: `Vous recevez cet e-mail parce que ${actor.name} vous a invité à valider « ${record.name} » sur Kora. Répondez à cet e-mail pour lui écrire.`,
      }),
    });
}
