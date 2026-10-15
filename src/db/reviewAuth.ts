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
// 4. Someone with the link but not invited can ask for access; the agency accepts or refuses.
//
// Codes: 10 minutes, 5 tries each, at most 5 per hour and 1 per minute per address, stored as an HMAC.

import "server-only";
import { createHash, createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { and, desc, eq, gt, inArray, lt } from "drizzle-orm";
import type { Db } from "./client";
import { applyChanges, bumpRevision } from "./state";
import { deliverables, reviewAccessRequests, reviewCodes, reviewLinks, reviewSessions } from "./schema";
import type { CurrentUser } from "@/lib/session";
import type { ReviewAccess } from "./reviewAccess";
import { appUrl, sendMail } from "@/lib/mail";

type Data = Record<string, unknown>;
type Invite = { email: string; at: string; id?: string };

export const reviewSessionCookie = "kora_review_session";
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

/** E-mail of a personal invitation address, to pre-fill the form. */
export const invitationEmail = (link: Data, invitationId: string | null) =>
  (invitationId && invitesOf(link).find((invite) => invite.id === invitationId)?.email) || null;

/** Sends a code to an invited address. Returns false when throttled or not invited (the caller answers the same). */
export async function sendAccessCode(db: Db, link: Data, email: string, deliverableName: string) {
  if (!validEmail(email) || !isInvited(link, email)) return false;
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
    text: `Votre code pour accéder à la revue « ${deliverableName} » : ${code}\n\nIl est valable ${codeMinutes} minutes. Si vous n'avez rien demandé, ignorez cet e-mail.`,
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

async function deliverableName(db: Db, org: string, deliverableId: number) {
  const [row] = await db
    .select({ name: deliverables.name })
    .from(deliverables)
    .where(and(eq(deliverables.organizationId, org), eq(deliverables.id, deliverableId)))
    .limit(1);
  return row?.name ?? "livrable";
}

async function linkRow(db: Db, org: string, linkKey: string) {
  const [row] = await db
    .select()
    .from(reviewLinks)
    .where(and(eq(reviewLinks.organizationId, org), eq(reviewLinks.key, linkKey)))
    .limit(1);
  return row ?? null;
}

const reviewUrl = (link: Data, invitationId?: string) =>
  `${appUrl()}/review/${encodeURIComponent(String(link.token))}${invitationId ? `?invitation=${invitationId}` : ""}`;

const requestOf = (org: string, linkKey: string) =>
  and(eq(reviewAccessRequests.organizationId, org), eq(reviewAccessRequests.linkKey, linkKey));

/**
 * Agency: invites addresses on one of its links and mails each one its personal address.
 * Returns the updated link and the addresses whose mail could not be sent.
 */
export async function inviteToReview(db: Db, org: string, linkKey: string, emails: string[], user: CurrentUser) {
  const row = await linkRow(db, org, linkKey);
  if (!row || !row.active) return null;
  const link = row.data as Data;
  const typed = [...new Set(emails.map(normalizeEmail))].filter(validEmail);
  const fresh = typed.filter((email) => !isInvited(link, email));
  const added: Invite[] = fresh.map((email) => ({ email, at: now(), id: randomBytes(12).toString("base64url") }));
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
          upsert: [{ id, type: "review.invited", actor: user.name, description: `Invitation envoyée à ${fresh.join(", ")}`, timestamp: now() }],
          remove: [],
        },
      },
      maps: { reviewLinks: { upsert: { [linkKey]: updated }, remove: [] } },
      settings: { upsert: {}, remove: [] },
    },
    { recordedBy: user.id },
  );

  const name = await deliverableName(db, org, row.deliverableId ?? 0);
  const notSent: string[] = [];
  for (const invite of added) {
    const sent = await sendMail({
      to: invite.email,
      subject: `${user.name} vous invite à valider « ${name} »`,
      text: `${user.name} vous invite à consulter et valider « ${name} » sur Kora.\n\nOuvrir la revue : ${reviewUrl(updated, invite.id)}\n\nUn code de vérification vous sera envoyé à cette adresse pour confirmer qu'il s'agit bien de vous.`,
    });
    if (!sent) notSent.push(invite.email);
  }
  return { link: updated, notSent };
}

/** Client: asks for access to a link. Its agency is notified once per address. */
export async function requestReviewAccess(db: Db, access: ReviewAccess, email: string, message: string) {
  const org = access.organizationId;
  const [existing] = await db
    .select()
    .from(reviewAccessRequests)
    .where(and(requestOf(org, access.key), eq(reviewAccessRequests.email, email)))
    .limit(1);
  if (existing?.status === "pending") return;
  // A link shared too widely must not flood the agency: past 20 pending requests, new ones are dropped.
  const pending = await db
    .select({ email: reviewAccessRequests.email })
    .from(reviewAccessRequests)
    .where(and(requestOf(org, access.key), eq(reviewAccessRequests.status, "pending")));
  if (pending.length >= 20) return;
  await db
    .insert(reviewAccessRequests)
    .values({ organizationId: org, linkKey: access.key, email, status: "pending", message: message || null })
    .onConflictDoUpdate({
      target: [reviewAccessRequests.organizationId, reviewAccessRequests.linkKey, reviewAccessRequests.email],
      set: { status: "pending", message: message || null, requestedAt: new Date(), decidedAt: null, decidedBy: null },
    });
  const name = await deliverableName(db, org, access.deliverableId);
  const id = Date.now();
  await applyChanges(
    db,
    org,
    {
      lists: {
        notifications: { upsert: [{ id, message: `${email} demande l'accès à la revue de « ${name} »`, time: "À l'instant" }], remove: [] },
        auditEvents: { upsert: [{ id, type: "review.access-requested", actor: email, description: `Demande d'accès de ${email}`, timestamp: now() }], remove: [] },
      },
      maps: {},
      settings: { upsert: {}, remove: [] },
    },
    { recordedBy: `review-request:${access.key}` },
  );
}

/** Agency: accepts (invites the address) or refuses an access request to one of its links. */
export async function decideAccessRequest(db: Db, org: string, linkKey: string, email: string, accepted: boolean, user: CurrentUser) {
  if (accepted) return inviteToReview(db, org, linkKey, [email], user);
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
          upsert: [{ id: Date.now(), type: "review.access-refused", actor: user.name, description: `Accès refusé à ${email}`, timestamp: now() }],
          remove: [],
        },
      },
      maps: {},
      settings: { upsert: {}, remove: [] },
    },
    { recordedBy: user.id },
  );
  const row = await linkRow(db, org, linkKey);
  return row ? { link: row.data as Data, notSent: [] as string[] } : null;
}
