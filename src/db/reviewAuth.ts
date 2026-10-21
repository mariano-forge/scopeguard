// Who may open a review link. Clients have no account and no password:
//
// 1. The agency invites addresses on a link. Each invitation gets its own address
//    (/review/<token>?invitation=<id>) that pre-fills the e-mail.
// 2. Opening the link asks for a 6-digit code sent to the address: it proves the person owns it.
//    The code is sent only to invited addresses, and the answer is the same either way, so the
//    page does not reveal who is invited.
// 3. Once verified, the device is remembered for 30 days (httpOnly cookie). The session belongs to the
//    address: it opens every link that address is invited to, and stops as soon as the agency
//    removes the invitation or revokes the link.
// 4. Someone with the link but not invited can ask for access; the agency's owner and administrators
//    are told by e-mail, and accept or refuse.
//
// Codes: 10 minutes, 5 tries each, at most 5 per hour and 1 per minute per address, stored as an HMAC.

import "server-only";
import { createHash, createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { and, desc, eq, gt, inArray, lt } from "drizzle-orm";
import type { Db } from "./client";
import { applyChanges, bumpRevision } from "./state";
import { commentProposals, comments, deliverables, reviewAccessRequests, reviewCodes, reviewLinks, reviewProfiles, reviewSessions } from "./schema";
import type { CurrentUser } from "@/lib/session";
import { expired, type ReviewAccess } from "./reviewAccess";
import { sendMail } from "@/lib/mail";
import { renderMail } from "@/lib/mailTemplates";
import { maskEmail } from "@/lib/maskEmail";
import { reviewUrl } from "./mailTargets";
import { roleOfInvite, type ClientRole } from "@/lib/clientRoles";
import { siteClientUrl } from "@/lib/siteReview";

type Data = Record<string, unknown>;
type Invite = { email: string; at: string; id?: string; role?: ClientRole };

export const reviewSessionCookie = "kora_review_session";
/**
 * The same session, opened in Kora's panel on the agency's staging site (src/lib/siteReview.ts). A
 * frame from another site gets no SameSite=Lax cookie, so this one is SameSite=None and Partitioned:
 * the browser keeps it for that site only, and never sends it when another site frames Kora.
 */
export const siteSessionCookie = "kora_review_site_session";
export const reviewSessionDays = 30;
const codeMinutes = 10;
const codeTries = 5;

export const normalizeEmail = (value: unknown) => (typeof value === "string" ? value.trim().toLowerCase() : "");
export const validEmail = (email: string) => email.length <= 254 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const now = () => new Date().toLocaleString("fr-FR");

function codeHash(email: string, code: string) {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error("BETTER_AUTH_SECRET is not set.");
  return createHmac("sha256", secret).update(`${email}:${code}`).digest("hex");
}

export function invitesOf(link: Data): Invite[] {
  return Array.isArray(link.invites) ? (link.invites as Invite[]).filter((invite) => typeof invite?.email === "string") : [];
}

export const isInvited = (link: Data, email: string) => invitesOf(link).some((invite) => normalizeEmail(invite.email) === email);

/** The role of an invited address on a link (src/lib/clientRoles.ts). */
export const inviteRole = (link: Data, email: string) => roleOfInvite(invitesOf(link).find((invite) => normalizeEmail(invite.email) === email));

/** E-mail of a personal invitation address, to pre-fill the form. */
export const invitationEmail = (link: Data, invitationId: string | null) =>
  (invitationId && invitesOf(link).find((invite) => invite.id === invitationId)?.email) || null;

/** What a personal link shows before verification (src/lib/maskEmail.ts). */
export { maskEmail };

/** The address a code is asked for: the invitation's when the page names one (personal link), else the one typed. */
export const requestedEmail = (link: Data, body: Record<string, unknown>) =>
  typeof body.invitation === "string" && body.invitation ? (invitationEmail(link, body.invitation) ?? "") : normalizeEmail(body.email);

/**
 * Sends a code to an invited address, or to a member's of the link's agency entering the panel on the
 * site (`member`, src/lib/siteAgency.ts). Returns false when throttled or not invited (the caller answers the same).
 */
export async function sendAccessCode(db: Db, link: Data, email: string, deliverableName: string, member = false) {
  if (!validEmail(email) || (!member && !isInvited(link, email))) return false;
  const recent = await db
    .select({ createdAt: reviewCodes.createdAt })
    .from(reviewCodes)
    .where(and(eq(reviewCodes.email, email), gt(reviewCodes.createdAt, new Date(Date.now() - 60 * 60 * 1000))))
    .orderBy(desc(reviewCodes.createdAt));
  if (recent.length >= 5 || (recent[0] && Date.now() - recent[0].createdAt.getTime() < 60 * 1000)) return false;

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await db.insert(reviewCodes).values({
    id: randomUUID(),
    email,
    codeHash: codeHash(email, code),
    expiresAt: new Date(Date.now() + codeMinutes * 60 * 1000),
  });
  await sendMail({
    to: email,
    subject: `${code} est votre code d'accès Kora`,
    ...renderMail({
      preheader: `Votre code pour la revue « ${deliverableName} »`,
      heading: "Votre code d’accès",
      paragraphs: [`Saisissez ce code pour accéder à la revue « ${deliverableName} ». Il est valable ${codeMinutes} minutes.`],
      code,
      footer: "Vous recevez cet e-mail parce qu’un code a été demandé pour cette adresse sur Kora. Si ce n’est pas vous, ignorez-le : personne ne peut accéder à la revue sans ce code.",
    }),
  });
  return true;
}

/** Checks the latest code of the address; each check uses one of its tries. */
export async function checkAccessCode(db: Db, email: string, code: string) {
  if (!/^\d{6}$/.test(code)) return false;
  const [latest] = await db
    .select()
    .from(reviewCodes)
    .where(and(eq(reviewCodes.email, email), gt(reviewCodes.expiresAt, new Date())))
    .orderBy(desc(reviewCodes.createdAt))
    .limit(1);
  if (!latest || latest.attempts >= codeTries) return false;
  await db.update(reviewCodes).set({ attempts: latest.attempts + 1 }).where(eq(reviewCodes.id, latest.id));
  const expected = Buffer.from(latest.codeHash, "hex");
  const given = Buffer.from(codeHash(email, code), "hex");
  if (!timingSafeEqual(expected, given)) return false;
  await db.delete(reviewCodes).where(eq(reviewCodes.email, email));
  return true;
}

export async function openReviewSession(db: Db, email: string, request: Request) {
  await db.delete(reviewSessions).where(lt(reviewSessions.expiresAt, new Date()));
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + reviewSessionDays * 24 * 60 * 60 * 1000);
  await db.insert(reviewSessions).values({
    id: randomUUID(),
    tokenHash: sha256(token),
    email,
    expiresAt,
    ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: request.headers.get("user-agent")?.slice(0, 500) ?? null,
  });
  return { token, expiresAt };
}

/** Verified address behind a session cookie, if still valid. */
export async function reviewSessionEmail(db: Db, token: string | undefined) {
  if (!token || token.length > 100) return null;
  const [session] = await db
    .select({ email: reviewSessions.email })
    .from(reviewSessions)
    .where(and(eq(reviewSessions.tokenHash, sha256(token)), gt(reviewSessions.expiresAt, new Date())))
    .limit(1);
  return session?.email ?? null;
}

/** Name of the version a link opens, for mails and the verification screen. */
export const reviewedDeliverableName = (db: Db, access: ReviewAccess) => deliverableName(db, access.organizationId, access.deliverableId);

/** The name a verified client gave at their first verification, if any. */
export async function reviewProfileName(db: Db, email: string) {
  const [profile] = await db.select({ name: reviewProfiles.name }).from(reviewProfiles).where(eq(reviewProfiles.email, email)).limit(1);
  return profile?.name ?? null;
}

/** Saves the client's full name ("Claire Martin"): 2 to 80 characters, spaces tidied. */
export async function saveReviewProfileName(db: Db, email: string, raw: string) {
  const name = raw.replace(/\s+/g, " ").trim();
  if (name.length < 2 || name.length > 80) return null;
  await db.insert(reviewProfiles).values({ email, name }).onConflictDoUpdate({ target: reviewProfiles.email, set: { name } });
  return name;
}

async function deliverableName(db: Db, org: string, deliverableId: number) {
  const [row] = await db
    .select({ name: deliverables.name })
    .from(deliverables)
    .where(and(eq(deliverables.organizationId, org), eq(deliverables.id, deliverableId)))
    .limit(1);
  return row?.name ?? "livrable";
}

/**
 * What a mail about a « Lien » deliverable leads to: its staging site with the toolbar (?kora), where the
 * client works; the review page stays for quotes and the validation. Null for any other deliverable.
 */
async function siteOfDeliverable(db: Db, org: string, deliverableId: number) {
  const [row] = await db
    .select({ data: deliverables.data })
    .from(deliverables)
    .where(and(eq(deliverables.organizationId, org), eq(deliverables.id, deliverableId)))
    .limit(1);
  return siteClientUrl(row?.data as Data | undefined);
}

/** The button and the line of a mail that opens a review: the staging site for a « Lien », else the review page. */
function reviewAccessOf(site: string | null, review: string) {
  return site
    ? {
        action: { label: "Ouvrir le site de recette", href: site },
        line: `Sur le site, ouvrez « Kora » en bas à droite pour commenter. Les devis et la validation se font sur la page de revue : ${review}`,
      }
    : { action: { label: "Ouvrir la revue", href: review }, line: null };
}

async function linkRow(db: Db, org: string, linkKey: string) {
  const [row] = await db
    .select()
    .from(reviewLinks)
    .where(and(eq(reviewLinks.organizationId, org), eq(reviewLinks.key, linkKey)))
    .limit(1);
  return row ?? null;
}


const requestOf = (org: string, linkKey: string) =>
  and(eq(reviewAccessRequests.organizationId, org), eq(reviewAccessRequests.linkKey, linkKey));

/**
 * Agency: invites addresses on one of its links and mails each one its personal address.
 * Returns the updated link and the addresses whose mail could not be sent.
 */
/** Where an agency or client request came from (src/lib/api.ts requestOrigin), kept on its audit events. */
type Origin = { ipAddress?: string | null; userAgent?: string | null };

/**
 * Invites addresses on a link with a role (decider: the agency's own invitations; contributor: an
 * access request accepted). An address already invited keeps its role: the agency changes it apart.
 */
export async function inviteToReview(
  db: Db,
  org: string,
  linkKey: string,
  emails: string[],
  user: CurrentUser,
  origin: Origin = {},
  role: ClientRole = "decider",
  /** The agency shares a new version with the people of the previous one: the mail says so. */
  newVersion = false,
) {
  const row = await linkRow(db, org, linkKey);
  if (!row || !row.active) return null;
  const link = row.data as Data;
  const typed = [...new Set(emails.map(normalizeEmail))].filter(validEmail);
  const fresh = typed.filter((email) => !isInvited(link, email));
  const added: Invite[] = fresh.map((email) => ({ email, at: now(), id: randomBytes(12).toString("base64url"), role }));
  const updated = { ...link, invites: [...invitesOf(link), ...added] };
  // Their access requests, if any, are answered by the invitation.
  if (typed.length)
    await db
      .update(reviewAccessRequests)
      .set({ status: "accepted", decidedAt: new Date(), decidedBy: user.id })
      .where(and(requestOf(org, linkKey), inArray(reviewAccessRequests.email, typed), eq(reviewAccessRequests.status, "pending")));
  if (!added.length) {
    if (typed.length) await bumpRevision(db, org);
    return { link: updated, notSent: [] as string[] };
  }

  const id = Date.now();
  await applyChanges(
    db,
    org,
    {
      lists: {
        auditEvents: {
          upsert: [{ id, type: "review.invited", actor: user.name, description: `Invitation envoyée à ${fresh.join(", ")} (${role === "decider" ? "décideur" : "contributeur"})`, timestamp: now(), deliverableId: row.deliverableId }],
          remove: [],
        },
      },
      maps: { reviewLinks: { upsert: { [linkKey]: updated }, remove: [] } },
      settings: { upsert: {}, remove: [] },
    },
    { recordedBy: user.id, ...origin },
  );

  const name = await deliverableName(db, org, row.deliverableId ?? 0);
  const site = await siteOfDeliverable(db, org, row.deliverableId ?? 0);
  const notSent: string[] = [];
  for (const invite of added) {
    const open = reviewAccessOf(site, reviewUrl(updated, invite.id));
    const sent = await sendMail({
      to: invite.email,
      subject: newVersion
        ? `Nouvelle version de « ${name} » (V${row.version ?? ""})`
        : role === "decider"
          ? `${user.name} vous invite à valider « ${name} »`
          : `${user.name} vous invite à donner votre avis sur « ${name} »`,
      replyTo: user.email,
      ...renderMail({
        preheader: newVersion
          ? `La version ${row.version ?? ""} de « ${name} » vous est partagée`
          : `${user.name}${user.organizationName ? ` (${user.organizationName})` : ""} partage « ${name} » avec vous`,
        heading: newVersion
          ? `La version ${row.version ?? ""} de « ${name} » est disponible`
          : role === "decider"
            ? `« ${name} » attend votre validation`
            : `« ${name} » attend vos retours`,
        paragraphs: [
          role === "decider"
            ? `${user.name}${user.organizationName ? `, de ${user.organizationName},` : ""} vous invite à consulter ce livrable, à y laisser vos retours et à le valider.`
            : `${user.name}${user.organizationName ? `, de ${user.organizationName},` : ""} vous invite à consulter ce livrable et à y laisser vos retours. La validation et les décisions sur les devis restent à la personne désignée par l’agence.`,
          "Pour protéger la revue, un code de vérification vous sera envoyé à cette adresse à l’ouverture.",
          ...(open.line ? [open.line] : []),
        ],
        action: open.action,
        footer: `Vous recevez cet e-mail parce que ${user.name} a partagé une revue avec ${invite.email} sur Kora. Répondez à cet e-mail pour lui écrire.`,
      }),
    });
    if (!sent) notSent.push(invite.email);
  }
  return { link: updated, notSent };
}

/**
 * A later version of the same deliverable shared with this client (active link, address invited):
 * the client page offers it from the version they are on. Nothing when none is open to them, so a
 * version still in preparation at the agency stays unknown to the client.
 */
export async function newerSharedVersion(db: Db, access: ReviewAccess, email: string) {
  const org = access.organizationId;
  const [current] = await db.select({ projectId: deliverables.projectId, name: deliverables.name }).from(deliverables).where(and(eq(deliverables.organizationId, org), eq(deliverables.id, access.deliverableId))).limit(1);
  if (!current) return null;
  const later = await db
    .select({ id: deliverables.id, version: deliverables.version, projectId: deliverables.projectId })
    .from(deliverables)
    .where(and(eq(deliverables.organizationId, org), eq(deliverables.name, current.name), gt(deliverables.version, access.version)))
    .orderBy(desc(deliverables.version));
  // The same deliverable: same project and name (src/app/(agency)/routes.ts).
  for (const version of later.filter((record) => (record.projectId ?? 1) === (current.projectId ?? 1))) {
    const row = await linkRow(db, org, `${version.id}:${version.version}`);
    const link = row?.data as Data | undefined;
    if (row?.active && link && link.active === true && !expired(link) && isInvited(link, email))
      return { version: version.version, href: `/review/${encodeURIComponent(String(link.token))}` };
  }
  return null;
}

/** Agency: accepts (invites the address) or refuses an access request to one of its links. */
export async function decideAccessRequest(db: Db, org: string, linkKey: string, email: string, accepted: boolean, user: CurrentUser, origin: Origin = {}) {
  // Someone given the link by a colleague comments; deciding stays with whom the agency chose.
  if (accepted) return inviteToReview(db, org, linkKey, [email], user, origin, "contributor");
  const row = await linkRow(db, org, linkKey);
  if (!row) return null;
  await db
    .update(reviewAccessRequests)
    .set({ status: "refused", decidedAt: new Date(), decidedBy: user.id })
    .where(and(requestOf(org, linkKey), eq(reviewAccessRequests.email, email)));
  await applyChanges(
    db,
    org,
    {
      lists: {
        auditEvents: {
          upsert: [{ id: Date.now(), type: "review.access-refused", actor: user.name, description: `Accès refusé à ${email}`, timestamp: now(), deliverableId: row.deliverableId }],
          remove: [],
        },
      },
      maps: {},
      settings: { upsert: {}, remove: [] },
    },
    { recordedBy: user.id, ...origin },
  );
  return { link: row.data as Data, notSent: [] as string[] };
}

/** Minimum time between two reminders on the same link. */
export const reminderCooldownMs = 24 * 60 * 60 * 1000;

/**
 * Agency: reminds every client invited on a link that the version waits for them, with their
 * personal link and what is pending. At most once a day per link, checked here.
 */
export async function remindReview(db: Db, org: string, linkKey: string, user: CurrentUser, origin: Origin = {}) {
  const row = await linkRow(db, org, linkKey);
  if (!row || !row.active || row.deliverableId === null) return { error: "Lien de revue introuvable ou révoqué.", status: 404 } as const;
  const link = row.data as Data;
  // The reminder asks for a validation and quote decisions: deciders only.
  const invites = invitesOf(link).filter((invite) => roleOfInvite(invite) === "decider");
  if (!invites.length) return { error: "Invitez d’abord un décideur sur cette revue.", status: 400 } as const;
  const last = typeof link.lastReminderAt === "number" ? link.lastReminderAt : 0;
  if (Date.now() - last < reminderCooldownMs) return { error: "Une relance a déjà été envoyée il y a moins de 24 heures.", status: 429 } as const;

  const [version] = await db
    .select({ name: deliverables.name, reviewStatus: deliverables.reviewStatus, data: deliverables.data })
    .from(deliverables)
    .where(and(eq(deliverables.organizationId, org), eq(deliverables.id, row.deliverableId)))
    .limit(1);
  if (!version || version.reviewStatus === "approved" || ["Approuvée", "Remplacée"].includes((version.data as Data).status as string))
    return { error: "Cette version n’attend plus de validation.", status: 400 } as const;

  // Quotes sent on this version and not decided yet.
  const pendingQuotes = (
    await db
      .select({ decision: commentProposals.decision })
      .from(commentProposals)
      .innerJoin(comments, and(eq(comments.organizationId, commentProposals.organizationId), eq(comments.id, commentProposals.commentId)))
      .where(and(eq(commentProposals.organizationId, org), eq(comments.deliverableId, row.deliverableId), eq(commentProposals.state, "sent")))
  ).filter((proposal) => !proposal.decision || proposal.decision === "none").length;

  const waiting = [
    version.reviewStatus === "changes-requested" ? null : `la version ${row.version ?? ""} attend votre validation`.replace("  ", " "),
    pendingQuotes ? `${pendingQuotes} proposition${pendingQuotes > 1 ? "s attendent" : " attend"} votre décision` : null,
  ].filter(Boolean);

  const site = siteClientUrl(version.data as Data);
  const notSent: string[] = [];
  for (const invite of invites) {
    const open = reviewAccessOf(site, reviewUrl(link, invite.id));
    const sent = await sendMail({
      to: invite.email,
      subject: `Rappel : « ${version.name} » attend votre retour`,
      replyTo: user.email,
      ...renderMail({
        preheader: waiting.length ? `${waiting.join(" et ")}`.replace(/^./, (first) => first.toUpperCase()) : "Votre retour est attendu",
        heading: `« ${version.name} » attend votre retour`,
        paragraphs: [`${user.name} vous rappelle que ${waiting.length ? waiting.join(" et ") : "votre retour est attendu"}.`, ...(open.line ? [open.line] : [])],
        action: open.action,
        footer: `Vous recevez ce rappel parce que ${user.name} a partagé cette revue avec ${invite.email} sur Kora. Répondez à cet e-mail pour lui écrire.`,
      }),
    });
    if (!sent) notSent.push(invite.email);
  }

  const sentAt = Date.now();
  const updated = { ...link, lastReminderAt: sentAt };
  const recipients = invites.map((invite) => invite.email).join(", ");
  await applyChanges(
    db,
    org,
    {
      lists: {
        auditEvents: {
          upsert: [{ id: sentAt, type: "review.reminded", actor: user.name, description: `Relance envoyée à ${recipients}`, timestamp: now(), deliverableId: row.deliverableId }],
          remove: [],
        },
        notifications: { upsert: [{ id: sentAt, message: `Relance envoyée à ${recipients}`, time: "À l'instant", deliverableId: row.deliverableId }], remove: [] },
      },
      maps: { reviewLinks: { upsert: { [linkKey]: updated }, remove: [] } },
      settings: { upsert: {}, remove: [] },
    },
    { recordedBy: user.id, ...origin },
  );
  return { link: updated, notSent };
}
