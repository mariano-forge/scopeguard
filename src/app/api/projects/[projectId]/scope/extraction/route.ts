// Agency, a project's scope read by the extraction engine (src/lib/scopeExtractor.ts):
//   POST /api/projects/:projectId/scope/extraction { text } or { file: "/api/files/<id>" } -> { items }
// A proposal only: nothing is written; the agency reviews the items and adds them to its draft.
// A file must be a PDF the agency imported itself. 503 while no engine is configured.

import { and, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { requestLimit, tooManyRequests, withinLimit } from "@/db/requestLimits";
import { projects } from "@/db/schema";
import { databaseFailure } from "@/lib/api";
import { readBody } from "@/lib/reviewViewer";
import { extractionLimits } from "@/lib/scopeExtraction";
import { extractionOff, extractionProvider, extractScope } from "@/lib/scopeExtractor";
import { requireAgencyUser } from "@/lib/session";
import { readOwnPdf } from "@/lib/storage";

export async function POST(request: Request, context: RouteContext<"/api/projects/[projectId]/scope/extraction">) {
  const auth = await requireAgencyUser();
  if ("response" in auth) return auth.response;
  const projectId = Number((await context.params).projectId);
  const body = await readBody(request);
  const text = typeof body.text === "string" && body.text.trim() ? body.text.trim() : undefined;
  const file = typeof body.file === "string" ? body.file : undefined;
  if (!Number.isSafeInteger(projectId) || projectId <= 0 || Boolean(text) === Boolean(file) || (text && text.length > extractionLimits.text))
    return Response.json({ error: "Collez un texte ou choisissez un PDF à lire." }, { status: 400 });
  const provider = extractionProvider();
  if (!provider) return extractionOff();

  try {
    const db = getDb();
    const org = auth.user.organizationId;
    const [project] = await db.select({ id: projects.id }).from(projects).where(and(eq(projects.organizationId, org), eq(projects.id, projectId))).limit(1);
    if (!project) return Response.json({ error: "Projet introuvable." }, { status: 404 });
    if (!(await withinLimit(db, `extraction:${auth.user.id}`, requestLimit.extractions()))) return tooManyRequests();
    const pdf = file ? await readOwnPdf(db, org, file) : undefined;
    if (file && !pdf) return Response.json({ error: "Document introuvable." }, { status: 404 });
    const result = await extractScope(provider, pdf ? { pdf } : { text: text! });
    return "error" in result ? Response.json(result, { status: 502 }) : Response.json(result);
  } catch (error) {
    return databaseFailure("api/projects/scope/extraction", error);
  }
}
