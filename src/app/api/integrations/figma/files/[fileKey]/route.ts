// A Figma file as the agency's connected account sees it (US-054): its name, its pages and its saved
// versions, for the dialogs that make a « Figma » deliverable or a new round of it. Any member may read it.

import { getDb } from "@/db/client";
import { loadFigmaFile } from "@/db/figmaConnection";
import { requestLimit, tooManyRequests, withinLimit } from "@/db/requestLimits";
import { databaseFailure } from "@/lib/api";
import { requireAgencyUser } from "@/lib/session";

export async function GET(_request: Request, context: RouteContext<"/api/integrations/figma/files/[fileKey]">) {
  const auth = await requireAgencyUser();
  if ("response" in auth) return auth.response;
  const { fileKey } = await context.params;
  if (!/^[A-Za-z0-9]{10,128}$/.test(fileKey)) return Response.json({ error: "Ce lien n’est pas celui d’un fichier Figma." }, { status: 400 });
  try {
    const db = getDb();
    // Each read calls Figma, whose own limits are per minute.
    if (!(await withinLimit(db, `write:${auth.user.id}`, requestLimit.writes()))) return tooManyRequests();
    const result = await loadFigmaFile(db, auth.user.organizationId, fileKey);
    return result.ok ? Response.json(result.file) : Response.json({ error: result.error, code: result.code }, { status: result.status });
  } catch (error) {
    return databaseFailure("api figma file", error);
  }
}
