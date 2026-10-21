// POST /api/review/:token/access/code { email } or { invitation } -> { ok, invited }: sends a code if the
// address is invited (a personal link names its invitation: the page never holds the full address).
// Otherwise the page says it has no access, with no form: whoever holds the link can then learn whether an
// address is invited, so the requests are limited per address (requestLimit.accessCodes). Codes are for
// clients only: an agency member enters the panel with their Kora session (src/lib/siteAgency.ts), and
// their address is answered as any other, never told apart.

import { getDb } from "@/db/client";
import { findReviewAccess } from "@/db/reviewAccess";
import { isInvited, requestedEmail, reviewedDeliverableName, sendAccessCode } from "@/db/reviewAuth";
import { requestLimit, tooManyRequests, withinLimit } from "@/db/requestLimits";
import { databaseFailure, requestOrigin } from "@/lib/api";
import { readBody, reviewNotFound } from "@/lib/reviewViewer";

export async function POST(request: Request, context: RouteContext<"/api/review/[token]/access/code">) {
  const { token } = await context.params;
  const body = await readBody(request);
  try {
    const db = getDb();
    const access = await findReviewAccess(db, token);
    if (!access) return reviewNotFound();
    if (!(await withinLimit(db, `access-code:${requestOrigin(request).ipAddress ?? "inconnue"}`, requestLimit.accessCodes()))) return tooManyRequests();
    const email = requestedEmail(access.link, body);
    const invited = Boolean(email) && isInvited(access.link, email);
    if (invited) await sendAccessCode(db, access.link, email, await reviewedDeliverableName(db, access));
    return Response.json({ ok: true, invited });
  } catch (error) {
    return databaseFailure("api/review/access/code", error);
  }
}
