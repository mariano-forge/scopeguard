// POST /api/review/:token/access/code { email } -> sends a code if the address is invited.
// Same answer in every case: the page cannot learn who is invited.

import { getDb } from "@/db/client";
import { findReviewAccess } from "@/db/reviewAccess";
import { normalizeEmail, reviewedDeliverableName, sendAccessCode } from "@/db/reviewAuth";
import { databaseFailure } from "@/lib/api";
import { readBody, reviewNotFound } from "@/lib/reviewViewer";

export async function POST(request: Request, context: RouteContext<"/api/review/[token]/access/code">) {
  const { token } = await context.params;
  const email = normalizeEmail((await readBody(request)).email);
  try {
    const db = getDb();
    const access = await findReviewAccess(db, token);
    if (!access) return reviewNotFound();
    await sendAccessCode(db, access.link, email, await reviewedDeliverableName(db, access));
    return Response.json({ ok: true });
  } catch (error) {
    return databaseFailure("api/review/access/code", error);
  }
}
