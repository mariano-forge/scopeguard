// POST /api/review/:token/access/request { email, message? } -> asks the agency for access.

import { getDb } from "@/db/client";
import { findReviewAccess } from "@/db/reviewAccess";
import { isInvited, normalizeEmail, requestReviewAccess, validEmail } from "@/db/reviewAuth";
import { databaseFailure } from "@/lib/api";
import { readBody, reviewNotFound } from "@/lib/reviewViewer";

export async function POST(request: Request, context: RouteContext<"/api/review/[token]/access/request">) {
  const { token } = await context.params;
  const body = await readBody(request);
  const email = normalizeEmail(body.email);
  const message = typeof body.message === "string" ? body.message.trim().slice(0, 500) : "";
  if (!validEmail(email)) return Response.json({ error: "Adresse e-mail invalide." }, { status: 400 });
  try {
    const db = getDb();
    const access = await findReviewAccess(db, token);
    if (!access) return reviewNotFound();
    // Already invited: nothing to ask, they can receive a code (same answer, to reveal nothing).
    if (!isInvited(access.link, email)) await requestReviewAccess(db, access, email, message);
    return Response.json({ ok: true });
  } catch (error) {
    return databaseFailure("api/review/access/request", error);
  }
}
