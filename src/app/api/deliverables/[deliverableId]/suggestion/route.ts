// Agency, the AI's suggestion for a request being typed in « + Demande » (src/db/qualificationSuggestion.ts):
//   POST /api/deliverables/:deliverableId/suggestion { title?, description?, excerpt? } -> { status, suggestion? }
// The words typed so far, against the project's active scope; nothing is written. 503 without AI.

import { and, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { suggestionFor } from "@/db/qualificationSuggestion";
import { requestLimit, tooManyRequests, withinLimit } from "@/db/requestLimits";
import { deliverables } from "@/db/schema";
import { maskContacts } from "@/lib/ai/scopeSuggestion";
import { suggestionModel } from "@/lib/ai/provider";
import { databaseFailure } from "@/lib/api";
import { typedRequestMaxLength } from "@/lib/qualificationSuggestion";
import { readBody } from "@/lib/reviewViewer";
import { requireAgencyUser } from "@/lib/session";

const words = (value: unknown) => (typeof value === "string" ? value.trim() : "");

export async function POST(request: Request, context: RouteContext<"/api/deliverables/[deliverableId]/suggestion">) {
  const auth = await requireAgencyUser();
  if ("response" in auth) return auth.response;
  const deliverableId = Number((await context.params).deliverableId);
  const body = await readBody(request);
  const [title, description, excerpt] = [words(body.title), words(body.description), words(body.excerpt)];
  const text = [description, excerpt && `Message reçu : ${excerpt}`].filter(Boolean).join("\n") || title;
  if (!Number.isSafeInteger(deliverableId) || deliverableId <= 0 || !text || title.length + text.length > typedRequestMaxLength)
    return Response.json({ error: "Décrivez la demande pour une suggestion." }, { status: 400 });
  const model = suggestionModel();
  if (!model) return Response.json({ error: "Les suggestions de l’IA ne sont pas configurées.", code: "AI_OFF" }, { status: 503 });

  try {
    const db = getDb();
    const org = auth.user.organizationId;
    const [version] = await db.select({ id: deliverables.id }).from(deliverables).where(and(eq(deliverables.organizationId, org), eq(deliverables.id, deliverableId))).limit(1);
    if (!version) return Response.json({ error: "Livrable introuvable." }, { status: 404 });
    if (!(await withinLimit(db, `suggestion:${auth.user.id}`, requestLimit.suggestions()))) return tooManyRequests();
    return Response.json(await suggestionFor(db, org, deliverableId, model, { text: maskContacts(text), ...(title ? { title: maskContacts(title) } : {}) }));
  } catch (error) {
    return databaseFailure("api/deliverables/suggestion", error);
  }
}
