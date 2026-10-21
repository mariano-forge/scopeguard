// POST /api/review/:token/access/code { email } or { invitation }, site? -> { ok, invited }: sends a code if
// the address is invited (a personal link names its invitation: the page never holds the full address),
// or, in the panel on the staging site (site: true), if it is a member's of the link's agency
// (src/lib/siteAgency.ts). Otherwise the page says it has no access, with no form (decided with the
// product owner on 21 October 2026): an address can then be learnt invited or not, so the requests are
// limited per address (requestLimit.accessCodes).

import { getDb } from "@/db/client";
import { findReviewAccess } from "@/db/reviewAccess";
import { isInvited, requestedEmail, reviewedDeliverableName, sendAccessCode } from "@/db/reviewAuth";
import { requestLimit, tooManyRequests, withinLimit } from "@/db/requestLimits";
import { databaseFailure, requestOrigin } from "@/lib/api";
import { memberIdByEmail } from "@/lib/siteAgency";
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
    const member = body.site === true && Boolean(email) && Boolean(await memberIdByEmail(access.organizationId, email));
    const invited = member || (Boolean(email) && isInvited(access.link, email));
    if (invited) await sendAccessCode(db, access.link, email, await reviewedDeliverableName(db, access), member);
    return Response.json({ ok: true, invited });
  } catch (error) {
    return databaseFailure("api/review/access/code", error);
  }
}
