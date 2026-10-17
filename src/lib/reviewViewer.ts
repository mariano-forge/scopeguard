// Who is looking at a review link: an invited client whose address was verified on this device,
// a member of the agency that owns it, previewing it (read-only), or nobody yet.

import "server-only";
import { cookies } from "next/headers";
import { getDb } from "@/db/client";
import { findReviewAccess, readReviewState, type ReviewAccess } from "@/db/reviewAccess";
import { readReviewAction, runReviewAction, type ReviewAction } from "@/db/reviewActions";
import { inviteRole, isInvited, reviewSessionCookie, reviewSessionDays, reviewSessionEmail, siteSessionCookie } from "@/db/reviewAuth";
import { deciderActions, type ClientRole } from "./clientRoles";
import { requestLimit, tooManyRequests, withinLimit } from "@/db/requestLimits";
import { databaseFailure, requestOrigin } from "./api";
import { getCurrentUser, isMemberOf } from "./session";
import { siteAgencyMember } from "./siteAgency";
import type { AgencyMember } from "@/db/agencyActions";

export type ReviewViewer =
  | { mode: "client"; access: ReviewAccess; email: string; role: ClientRole }
  | { mode: "preview"; access: ReviewAccess; email: null }
  /** A member of the agency in the panel on the staging site, opened on this version (src/lib/siteAgency.ts). */
  | { mode: "agency"; access: ReviewAccess; email: null; member: AgencyMember }
  /** `email`: verified on this device, but not invited to this link. */
  | { mode: "none"; access: ReviewAccess; email: string | null };

/** null when the link is unknown, revoked or expired. */
export async function getReviewViewer(token: string): Promise<ReviewViewer | null> {
  const db = getDb();
  const access = await findReviewAccess(db, token);
  if (!access) return null;
  const jar = await cookies();
  const email = await reviewSessionEmail(db, jar.get(reviewSessionCookie)?.value ?? jar.get(siteSessionCookie)?.value);
  if (email && isInvited(access.link, email)) return { mode: "client", access, email, role: inviteRole(access.link, email) };
  // Preview: a member of the agency that owns the link, not any signed-in member.
  const user = await getCurrentUser();
  if (user && (await isMemberOf(user.id, access.organizationId))) return { mode: "preview", access, email: null };
  const site = await siteAgencyMember();
  if (site && site.linkKey === access.key && site.member.organizationId === access.organizationId) return { mode: "agency", access, email: null, member: site.member };
  return { mode: "none", access, email };
}

/** `site`: verified in the panel on the agency's site, which only keeps a partitioned cookie (reviewAuth.ts). */
export async function setReviewSessionCookie(token: string, expiresAt: Date, site = false) {
  const lifetime = { path: "/", expires: expiresAt, maxAge: reviewSessionDays * 24 * 60 * 60, httpOnly: true };
  if (site) (await cookies()).set(siteSessionCookie, token, { ...lifetime, secure: true, sameSite: "none", partitioned: true });
  else (await cookies()).set(reviewSessionCookie, token, { ...lifetime, secure: process.env.NODE_ENV === "production", sameSite: "lax" });
}

export const reviewNotFound = () => Response.json({ error: "Lien de revue invalide ou expiré" }, { status: 404 });

/** Request body as an object, or {} when malformed. */
export async function readBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    return body && typeof body === "object" && !Array.isArray(body) ? body : {};
  } catch {
    return {};
  }
}

/**
 * One client action on a review (routes under /api/review/:token/, see src/db/reviewActions.ts):
 * a verified client of this link, within the write limit; the agency's preview only reads.
 * Cross-site requests are refused by src/proxy.ts.
 */
export async function reviewActionResponse(
  request: Request,
  token: string,
  type: ReviewAction["type"],
  params: { commentId?: string; replyId?: string } = {},
) {
  const body = request.method === "DELETE" ? {} : await readBody(request);
  const action = readReviewAction(type, body, params);
  if (!action) return Response.json({ error: "Requête invalide" }, { status: 400 });
  try {
    const viewer = await getReviewViewer(token);
    if (!viewer) return reviewNotFound();
    if (viewer.mode === "preview" || viewer.mode === "agency") return Response.json({ error: "Aperçu agence : lecture seule" }, { status: 403 });
    if (viewer.mode === "none") return Response.json({ error: "Vérification de votre adresse requise" }, { status: 401 });
    if (deciderActions.has(type) && viewer.role !== "decider")
      return Response.json({ error: "Seul un décideur désigné par l’agence peut prendre cette décision.", code: "DECIDER_ONLY" }, { status: 403 });
    const db = getDb();
    if (!(await withinLimit(db, `client-write:${viewer.email}`, requestLimit.writes()))) return tooManyRequests();
    const result = await runReviewAction(db, viewer.access, viewer.email, requestOrigin(request), action);
    if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
    // The review after the action comes with the answer: the page needs no second request to show it.
    const fresh = await readReviewState(db, viewer.access);
    return Response.json({ ...(result.id ? { id: result.id } : {}), revision: fresh.revision, state: fresh.state });
  } catch (error) {
    return databaseFailure(`api/review ${type}`, error);
  }
}
