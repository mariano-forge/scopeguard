// Agency: POST /api/review-access/invite { linkKey, emails } -> invites the addresses and mails each
// its personal link. Returns { link, notSent } (addresses whose mail could not be sent).

import { getDb } from "@/db/client";
import { inviteToReview } from "@/db/reviewAuth";
import { databaseFailure, requestOrigin } from "@/lib/api";
import { readBody } from "@/lib/reviewViewer";
import { requireAgencyUser } from "@/lib/session";

export async function POST(request: Request) {
  const auth = await requireAgencyUser();
  if ("response" in auth) return auth.response;
  const { user } = auth;
  const body = await readBody(request);
  const emails = Array.isArray(body.emails) ? body.emails.filter((email): email is string => typeof email === "string").slice(0, 50) : [];
  if (typeof body.linkKey !== "string" || !emails.length) return Response.json({ error: "Requête invalide" }, { status: 400 });

  try {
    const result = await inviteToReview(getDb(), user.organizationId, body.linkKey, emails, user, requestOrigin(request));
    if (!result) return Response.json({ error: "Lien de revue introuvable ou révoqué" }, { status: 404 });
    return Response.json(result);
  } catch (error) {
    return databaseFailure("api/review-access/invite", error);
  }
}
