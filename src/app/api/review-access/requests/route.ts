// Agency: POST /api/review-access/requests { linkKey, email, decision: "accepted" | "refused" }.
// Accepting invites the address (it receives its personal link). Returns { link, notSent }.

import { getDb } from "@/db/client";
import { decideAccessRequest, normalizeEmail } from "@/db/reviewAuth";
import { databaseFailure, requestOrigin } from "@/lib/api";
import { readBody } from "@/lib/reviewViewer";
import { requireAgencyUser } from "@/lib/session";

export async function POST(request: Request) {
  const auth = await requireAgencyUser();
  if ("response" in auth) return auth.response;
  const { user } = auth;
  const body = await readBody(request);
  const email = normalizeEmail(body.email);
  if (typeof body.linkKey !== "string" || !email || (body.decision !== "accepted" && body.decision !== "refused"))
    return Response.json({ error: "Requête invalide" }, { status: 400 });

  try {
    const result = await decideAccessRequest(getDb(), user.organizationId, body.linkKey, email, body.decision === "accepted", user, requestOrigin(request));
    if (!result) return Response.json({ error: "Lien de revue introuvable ou révoqué" }, { status: 404 });
    return Response.json(result);
  } catch (error) {
    return databaseFailure("api/review-access/requests", error);
  }
}
