// Agency: POST /api/review-access/remind { linkKey } -> mails every client invited on the link a
// reminder with their personal link. Once a day per link. Returns { link, notSent }.

import { getDb } from "@/db/client";
import { remindReview } from "@/db/reviewAuth";
import { databaseFailure, requestOrigin } from "@/lib/api";
import { readBody } from "@/lib/reviewViewer";
import { requireAgencyUser } from "@/lib/session";

export async function POST(request: Request) {
  const auth = await requireAgencyUser();
  if ("response" in auth) return auth.response;
  const body = await readBody(request);
  if (typeof body.linkKey !== "string") return Response.json({ error: "Requête invalide" }, { status: 400 });

  try {
    const result = await remindReview(getDb(), auth.user.organizationId, body.linkKey, auth.user, requestOrigin(request));
    if ("error" in result) return Response.json({ error: result.error }, { status: result.status });
    return Response.json(result);
  } catch (error) {
    return databaseFailure("api/review-access/remind", error);
  }
}
