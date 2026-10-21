// POST /api/review/:token/site/ticket -> { ticket }
// From the Kora window « Je suis de l'agence » (/review/:token/site/agence): a member of the agency
// that owns the link gets a 2-minute ticket for the panel on the staging site (src/lib/siteAgency.ts).
// Anyone else gets the same 404 as an unknown link.

import { getDb } from "@/db/client";
import { findReviewAccess } from "@/db/reviewAccess";
import { databaseFailure } from "@/lib/api";
import { reviewNotFound } from "@/lib/reviewViewer";
import { getCurrentUser, isMemberOf } from "@/lib/session";
import { siteTicket } from "@/lib/siteAgency";

export async function POST(_request: Request, context: RouteContext<"/api/review/[token]/site/ticket">) {
  const { token } = await context.params;
  try {
    const access = await findReviewAccess(getDb(), token);
    const user = await getCurrentUser();
    if (!access || !user || !(await isMemberOf(user.id, access.organizationId))) return reviewNotFound();
    return Response.json({ ticket: siteTicket(user.id, access) });
  } catch (error) {
    return databaseFailure("api/review/site/ticket", error);
  }
}
