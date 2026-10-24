// Agency, the AI's suggestion for qualifying a stored request (src/db/qualificationSuggestion.ts):
//   POST /api/comments/:commentId/suggestion -> { status, suggestion? }
// Read from the request's thread and its project's active scope; nothing is written. 503 without AI.

import { getDb } from "@/db/client";
import { storedComment } from "@/db/actions";
import { requestOfComment, suggestionFor } from "@/db/qualificationSuggestion";
import { requestLimit, tooManyRequests, withinLimit } from "@/db/requestLimits";
import { suggestionModel } from "@/lib/ai/provider";
import { databaseFailure } from "@/lib/api";
import { requireAgencyUser } from "@/lib/session";

export async function POST(_request: Request, context: RouteContext<"/api/comments/[commentId]/suggestion">) {
  const auth = await requireAgencyUser();
  if ("response" in auth) return auth.response;
  const commentId = Number((await context.params).commentId);
  if (!Number.isSafeInteger(commentId) || commentId <= 0) return Response.json({ error: "Demande introuvable." }, { status: 404 });
  const model = suggestionModel();
  if (!model) return Response.json({ error: "Les suggestions de l’IA ne sont pas configurées.", code: "AI_OFF" }, { status: 503 });

  try {
    const db = getDb();
    const org = auth.user.organizationId;
    const stored = await storedComment(db, org, commentId);
    if (!stored || stored.deliverableId === null) return Response.json({ error: "Demande introuvable." }, { status: 404 });
    if (!(await withinLimit(db, `suggestion:${auth.user.id}`, requestLimit.suggestions()))) return tooManyRequests();
    return Response.json(await suggestionFor(db, org, stored.deliverableId, model, requestOfComment(stored.data)));
  } catch (error) {
    return databaseFailure("api/comments/suggestion", error);
  }
}
