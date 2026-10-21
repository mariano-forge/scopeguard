// POST /api/review/:token/access/verify { email or invitation, code, site? } -> opens a 30-day session on this device.
// site: true from Kora's panel on the agency's staging site, whose session is kept for that site only.

import { getDb } from "@/db/client";
import { findReviewAccess } from "@/db/reviewAccess";
import { checkAccessCode, isInvited, openReviewSession, requestedEmail } from "@/db/reviewAuth";
import { databaseFailure } from "@/lib/api";
import { readBody, reviewNotFound, setReviewSessionCookie } from "@/lib/reviewViewer";

export async function POST(request: Request, context: RouteContext<"/api/review/[token]/access/verify">) {
  const { token } = await context.params;
  const body = await readBody(request);
  const code = typeof body.code === "string" ? body.code.replace(/\s/g, "") : "";
  try {
    const db = getDb();
    const access = await findReviewAccess(db, token);
    if (!access) return reviewNotFound();
    const email = requestedEmail(access.link, body);
    if (!isInvited(access.link, email) || !(await checkAccessCode(db, email, code)))
      return Response.json({ error: "Code incorrect ou expiré." }, { status: 400 });
    const session = await openReviewSession(db, email, request);
    await setReviewSessionCookie(session.token, session.expiresAt, body.site === true);
    return Response.json({ ok: true });
  } catch (error) {
    return databaseFailure("api/review/access/verify", error);
  }
}
