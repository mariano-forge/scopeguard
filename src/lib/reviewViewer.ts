// Who is looking at a review link: an invited client whose address was verified on this device,
// an agency member previewing it (read-only), or nobody yet.

import "server-only";
import { cookies } from "next/headers";
import { getDb } from "@/db/client";
import { findReviewAccess, type ReviewAccess } from "@/db/reviewAccess";
import { isInvited, reviewSessionCookie, reviewSessionDays, reviewSessionEmail } from "@/db/reviewAuth";
import { getCurrentUser } from "./session";

export type ReviewViewer =
  | { mode: "client"; access: ReviewAccess; email: string }
  | { mode: "preview"; access: ReviewAccess; email: null }
  /** `email`: verified on this device, but not invited to this link. */
  | { mode: "none"; access: ReviewAccess; email: string | null };

/** null when the link is unknown, revoked or expired. */
export async function getReviewViewer(token: string): Promise<ReviewViewer | null> {
  const db = getDb();
  const access = await findReviewAccess(db, token);
  if (!access) return null;
  const email = await reviewSessionEmail(db, (await cookies()).get(reviewSessionCookie)?.value);
  if (email && isInvited(access.link, email)) return { mode: "client", access, email };
  if (await getCurrentUser()) return { mode: "preview", access, email: null };
  return { mode: "none", access, email };
}

export async function setReviewSessionCookie(token: string, expiresAt: Date) {
  (await cookies()).set(reviewSessionCookie, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
    maxAge: reviewSessionDays * 24 * 60 * 60,
  });
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
