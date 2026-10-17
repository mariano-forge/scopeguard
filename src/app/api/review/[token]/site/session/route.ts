// POST /api/review/:token/site/session { ticket } -> { ok }
// The panel on the staging site exchanges the ticket of the Kora window for its own session, kept
// for that site only (src/lib/siteAgency.ts).

import { getDb } from "@/db/client";
import { findReviewAccess } from "@/db/reviewAccess";
import { databaseFailure } from "@/lib/api";
import { readBody, reviewNotFound } from "@/lib/reviewViewer";
import { openSiteAgencySession } from "@/lib/siteAgency";

export async function POST(request: Request, context: RouteContext<"/api/review/[token]/site/session">) {
  const { token } = await context.params;
  const body = await readBody(request);
  try {
    const access = await findReviewAccess(getDb(), token);
    if (!access) return reviewNotFound();
    if (!(await openSiteAgencySession(body.ticket, access))) return Response.json({ error: "Ticket invalide ou expiré. Recommencez." }, { status: 400 });
    return Response.json({ ok: true });
  } catch (error) {
    return databaseFailure("api/review/site/session", error);
  }
}
