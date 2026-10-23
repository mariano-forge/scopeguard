// A Figma file as the agency's connected account sees it (US-054): its name, its pages and its saved
// versions, for « Nouveau livrable ». Its pages are Figma's tightest read (20 a month for a View or Collab
// seat): the dialog asks once per file, and the answer carries a signed receipt of them that the creation
// sends back, so the server does not read them again (src/lib/figmaReceipt.ts). Any member may read it.

import { getDb } from "@/db/client";
import { loadFigmaFile } from "@/db/figmaConnection";
import { requestLimit, tooManyRequests, withinLimit } from "@/db/requestLimits";
import { databaseFailure } from "@/lib/api";
import { figmaReceipt } from "@/lib/figmaReceipt";
import { requireAgencyUser } from "@/lib/session";

export async function GET(_request: Request, context: RouteContext<"/api/integrations/figma/files/[fileKey]">) {
  const auth = await requireAgencyUser();
  if ("response" in auth) return auth.response;
  const { fileKey } = await context.params;
  if (!/^[A-Za-z0-9]{10,128}$/.test(fileKey)) return Response.json({ error: "Ce lien n’est pas celui d’un fichier Figma." }, { status: 400 });
  try {
    const db = getDb();
    if (!(await withinLimit(db, `write:${auth.user.id}`, requestLimit.writes()))) return tooManyRequests();
    const result = await loadFigmaFile(db, auth.user.organizationId, fileKey);
    if (!result.ok) return Response.json({ error: result.error, code: result.code }, { status: result.status });
    return Response.json({ ...result.tree, versions: result.versions, receipt: figmaReceipt(auth.user.organizationId, fileKey, result.tree) });
  } catch (error) {
    return databaseFailure("api figma file", error);
  }
}
