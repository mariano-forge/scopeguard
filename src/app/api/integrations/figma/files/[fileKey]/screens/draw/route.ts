// Figma draws the screens picked, all in one request (US-054, step 2c): POST { receipt, ids, format } -> { ticket, drawn }.

import { getDb } from "@/db/client";
import { drawFigmaScreens } from "@/db/figmaScreens";
import { requestLimit, tooManyRequests, withinLimit } from "@/db/requestLimits";
import { databaseFailure } from "@/lib/api";
import { readScreenFormat, readScreenIds } from "@/lib/figmaScreens";
import { readBody } from "@/lib/reviewViewer";
import { requireAgencyUser } from "@/lib/session";

export async function POST(request: Request, context: RouteContext<"/api/integrations/figma/files/[fileKey]/screens/draw">) {
  const auth = await requireAgencyUser();
  if ("response" in auth) return auth.response;
  const { fileKey } = await context.params;
  const body = await readBody(request);
  const ids = readScreenIds(body.ids);
  const format = readScreenFormat(body.format);
  if (!/^[A-Za-z0-9]{10,128}$/.test(fileKey) || !ids || !format || typeof body.receipt !== "string") return Response.json({ error: "Requête invalide" }, { status: 400 });
  try {
    const db = getDb();
    if (!(await withinLimit(db, `write:${auth.user.id}`, requestLimit.writes()))) return tooManyRequests();
    const result = await drawFigmaScreens(db, auth.user.organizationId, auth.user.id, fileKey, body.receipt, ids, format);
    if (!result.ok) return Response.json({ error: result.error, ...("code" in result && result.code ? { code: result.code } : {}) }, { status: result.status });
    return Response.json({ ticket: result.ticket, drawn: result.drawn });
  } catch (error) {
    return databaseFailure("api figma draw", error);
  }
}
