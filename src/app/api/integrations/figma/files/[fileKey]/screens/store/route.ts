// One screen drawn by Figma, copied into the agency's storage (US-054, step 2c):
// POST { ticket, id, projectId, livrableId, version } -> { fileData, mimeType }. The deliverable names it next.

import { getDb } from "@/db/client";
import { storeFigmaScreen } from "@/db/figmaScreens";
import { requestLimit, tooManyRequests, withinLimit } from "@/db/requestLimits";
import { id } from "@/db/actions";
import { databaseFailure } from "@/lib/api";
import { readBody } from "@/lib/reviewViewer";
import { requireAgencyUser } from "@/lib/session";

export async function POST(request: Request, context: RouteContext<"/api/integrations/figma/files/[fileKey]/screens/store">) {
  const auth = await requireAgencyUser();
  if ("response" in auth) return auth.response;
  const { fileKey } = await context.params;
  const body = await readBody(request);
  const [projectId, livrableId, version] = [id(body.projectId), id(body.livrableId), id(body.version)];
  const screen = typeof body.id === "string" && /^[\w:;-]{1,100}$/.test(body.id) ? body.id : null;
  if (!/^[A-Za-z0-9]{10,128}$/.test(fileKey) || !screen || !projectId || !livrableId || !version || typeof body.ticket !== "string")
    return Response.json({ error: "Requête invalide" }, { status: 400 });
  try {
    const db = getDb();
    if (!(await withinLimit(db, `write:${auth.user.id}`, requestLimit.writes()))) return tooManyRequests();
    const result = await storeFigmaScreen(db, auth.user.organizationId, auth.user.id, fileKey, body.ticket, screen, { kind: "version", projectId, livrableId, version });
    if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
    return Response.json({ fileData: result.fileData, mimeType: result.mimeType });
  } catch (error) {
    return databaseFailure("api figma store", error);
  }
}
