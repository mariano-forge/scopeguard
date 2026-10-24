// The screens of a Figma file, as the member's Figma account sees them (US-054, step 2c), for « Nouveau
// livrable » › Écrans Figma: one of Figma's tightest reads, with a signed receipt (src/db/figmaScreens.ts).

import { getDb } from "@/db/client";
import { loadFigmaScreens } from "@/db/figmaScreens";
import { requestLimit, tooManyRequests, withinLimit } from "@/db/requestLimits";
import { databaseFailure } from "@/lib/api";
import { requireAgencyUser } from "@/lib/session";

export async function GET(_request: Request, context: RouteContext<"/api/integrations/figma/files/[fileKey]/screens">) {
  const auth = await requireAgencyUser();
  if ("response" in auth) return auth.response;
  const { fileKey } = await context.params;
  if (!/^[A-Za-z0-9]{10,128}$/.test(fileKey)) return Response.json({ error: "Ce lien n’est pas celui d’un fichier Figma." }, { status: 400 });
  try {
    const db = getDb();
    if (!(await withinLimit(db, `write:${auth.user.id}`, requestLimit.writes()))) return tooManyRequests();
    const result = await loadFigmaScreens(db, auth.user.organizationId, auth.user.id, fileKey);
    if (!result.ok) return Response.json({ error: result.error, ...("code" in result && result.code ? { code: result.code } : {}) }, { status: result.status });
    return Response.json({ name: result.name, screens: result.screens, receipt: result.receipt });
  } catch (error) {
    return databaseFailure("api figma screens", error);
  }
}
