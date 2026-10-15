// POST /api/review/:token/access/profile { name } -> the verified client's full name, asked at their
// first verification. Only for an address verified on this device and invited to this link.

import { getDb } from "@/db/client";
import { saveReviewProfileName } from "@/db/reviewAuth";
import { databaseFailure } from "@/lib/api";
import { getReviewViewer, readBody, reviewNotFound } from "@/lib/reviewViewer";

export async function POST(request: Request, context: RouteContext<"/api/review/[token]/access/profile">) {
  const { token } = await context.params;
  const body = await readBody(request);
  try {
    const viewer = await getReviewViewer(token);
    if (!viewer) return reviewNotFound();
    if (viewer.mode !== "client") return Response.json({ error: "Vérification de votre adresse requise" }, { status: 401 });
    const name = await saveReviewProfileName(getDb(), viewer.email, typeof body.name === "string" ? body.name : "");
    if (!name) return Response.json({ error: "Indiquez votre nom complet (2 à 80 caractères)." }, { status: 400 });
    return Response.json({ name });
  } catch (error) {
    return databaseFailure("api/review/access/profile", error);
  }
}
