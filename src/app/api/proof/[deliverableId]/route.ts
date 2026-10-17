// Agency: GET /api/proof/:deliverableId -> the proof of that version (src/db/proof.ts), read from the
// database. Any member of the agency may export it.

import { getDb } from "@/db/client";
import { buildProof } from "@/db/proof";
import { databaseFailure } from "@/lib/api";
import { requireAgencyUser } from "@/lib/session";

export async function GET(_request: Request, context: RouteContext<"/api/proof/[deliverableId]">) {
  const auth = await requireAgencyUser();
  if ("response" in auth) return auth.response;
  const deliverableId = Number((await context.params).deliverableId);
  if (!Number.isSafeInteger(deliverableId)) return Response.json({ error: "Livrable introuvable" }, { status: 404 });

  try {
    const proof = await buildProof(getDb(), auth.user.organizationId, deliverableId, auth.user);
    if (!proof) return Response.json({ error: "Livrable introuvable" }, { status: 404 });
    return Response.json(proof, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return databaseFailure("api/proof", error);
  }
}
