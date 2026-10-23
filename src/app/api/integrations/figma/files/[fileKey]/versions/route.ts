// The versions saved in a Figma file's history (US-054): « Relire le fichier » and « Nouvelle tournée
// Figma » read them alone, a read Figma allows far more often than the file's pages. Any member may read it.

import { getDb } from "@/db/client";
import { loadFigmaVersions } from "@/db/figmaConnection";
import { requestLimit, tooManyRequests, withinLimit } from "@/db/requestLimits";
import { databaseFailure } from "@/lib/api";
import { requireAgencyUser } from "@/lib/session";

export async function GET(_request: Request, context: RouteContext<"/api/integrations/figma/files/[fileKey]/versions">) {
  const auth = await requireAgencyUser();
  if ("response" in auth) return auth.response;
  const { fileKey } = await context.params;
  if (!/^[A-Za-z0-9]{10,128}$/.test(fileKey)) return Response.json({ error: "Ce lien n’est pas celui d’un fichier Figma." }, { status: 400 });
  try {
    const db = getDb();
    if (!(await withinLimit(db, `write:${auth.user.id}`, requestLimit.writes()))) return tooManyRequests();
    const result = await loadFigmaVersions(db, auth.user.organizationId, fileKey);
    return result.ok ? Response.json({ versions: result.versions }) : Response.json({ error: result.error, code: result.code }, { status: result.status });
  } catch (error) {
    return databaseFailure("api figma versions", error);
  }
}
