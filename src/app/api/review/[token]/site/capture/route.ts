// POST /api/review/:token/site/capture (multipart: file) -> { href }
// The capture of the window when a request is placed on the staging site, sent by the panel before
// the request names it (src/lib/siteCapture.ts). A verified client of the link, or an agency member in
// the panel; a JPEG or PNG image only, recognised by its bytes.

import { getDb } from "@/db/client";
import { requestLimit, tooManyRequests, withinLimit } from "@/db/requestLimits";
import { databaseFailure } from "@/lib/api";
import { getReviewViewer, reviewNotFound } from "@/lib/reviewViewer";
import { clientUploader, maxCaptureBytes, storeSiteCapture } from "@/lib/siteCapture";

const tooLarge = () => Response.json({ error: "Capture trop lourde." }, { status: 413 });

export async function POST(request: Request, context: RouteContext<"/api/review/[token]/site/capture">) {
  const { token } = await context.params;
  try {
    const viewer = await getReviewViewer(token);
    if (!viewer) return reviewNotFound();
    const uploader = viewer.mode === "client" ? clientUploader(viewer.email) : viewer.mode === "agency" ? viewer.member.id : null;
    if (!uploader) return Response.json({ error: "Vérification de votre adresse requise" }, { status: 401 });
    const db = getDb();
    if (!(await withinLimit(db, `upload:${uploader}`, requestLimit.uploads()))) return tooManyRequests();
    // Refused before reading the body when it announces more than the limit (plus the form's envelope).
    if (Number(request.headers.get("content-length") ?? 0) > maxCaptureBytes() + 16 * 1024) return tooLarge();
    const file = (await request.formData().catch(() => null))?.get("file");
    if (!(file instanceof File) || file.size === 0) return Response.json({ error: "Aucune capture" }, { status: 400 });
    if (file.size > maxCaptureBytes()) return tooLarge();
    const stored = await storeSiteCapture(db, viewer.access, Buffer.from(await file.arrayBuffer()), uploader);
    if (!stored) return Response.json({ error: "La capture doit être une image JPEG ou PNG." }, { status: 400 });
    return Response.json({ href: stored.href });
  } catch (error) {
    return databaseFailure("api/review/site/capture", error);
  }
}
