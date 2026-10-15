// POST /api/review/:token/access/verify { email, code } -> opens a 30-day session on this device.

import { getDb } from "@/db/client";
import { findReviewAccess } from "@/db/reviewAccess";
import { checkAccessCode, isInvited, normalizeEmail, openReviewSession } from "@/db/reviewAuth";
import { databaseFailure } from "@/lib/api";
import { readBody, reviewNotFound, setReviewSessionCookie } from "@/lib/reviewViewer";

export async function POST(request: Request, context: RouteContext<"/api/review/[token]/access/verify">) {
  const { token } = await context.params;
  const body = await readBody(request);
  const email = normalizeEmail(body.email);
  const code = typeof body.code === "string" ? body.code.replace(/\s/g, "") : "";
  try {
    const db = getDb();
    const access = await findReviewAccess(db, token);
    if (!access) return reviewNotFound();
    if (!isInvited(access.link, email) || !(await checkAccessCode(db, email, code)))
      return Response.json({ error: "Code incorrect ou expiré." }, { status: 400 });
    const session = await openReviewSession(db, email, request);
    await setReviewSessionCookie(session.token, session.expiresAt);
    return Response.json({ ok: true });
  } catch (error) {
    return databaseFailure("api/review/access/verify", error);
  }
}
