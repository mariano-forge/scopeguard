// POST /api/review/:token/site/handoff/open { ticket } -> { ok }
// The review page's tab, opened from the panel on the staging site, exchanges the panel's ticket for
// the usual 30-day session on this device (src/lib/siteHandoff.ts).

import { getDb } from "@/db/client";
import { findReviewAccess } from "@/db/reviewAccess";
import { openReviewSession } from "@/db/reviewAuth";
import { requestLimit, tooManyRequests, withinLimit } from "@/db/requestLimits";
import { databaseFailure } from "@/lib/api";
import { readBody, reviewNotFound, setReviewSessionCookie } from "@/lib/reviewViewer";
import { handoffEmail } from "@/lib/siteHandoff";

export async function POST(request: Request, context: RouteContext<"/api/review/[token]/site/handoff/open">) {
  const { token } = await context.params;
  const body = await readBody(request);
  try {
    const db = getDb();
    const access = await findReviewAccess(db, token);
    if (!access) return reviewNotFound();
    const email = handoffEmail(body.ticket, access);
    if (!email) return Response.json({ error: "Lien expiré : vérifiez votre adresse sur la page de revue." }, { status: 400 });
    // Each exchange opens a session (a row): counted as the client's writes.
    if (!(await withinLimit(db, `client-write:${email}`, requestLimit.writes()))) return tooManyRequests();
    const session = await openReviewSession(db, email, request);
    await setReviewSessionCookie(session.token, session.expiresAt);
    return Response.json({ ok: true });
  } catch (error) {
    return databaseFailure("api/review/site/handoff/open", error);
  }
}
