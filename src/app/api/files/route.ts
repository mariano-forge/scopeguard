// Agency: POST /api/files (multipart) imports a file into the agency's container.
//   file        the file
//   kind        "version" | "cover" | "request"
//   projectId, livrableId, version   where it belongs, for its path (projets/<id>/livrables/<id>/v<n>/…)
// Returns { id, href, sha256, size }; the page then stores `href` in the deliverable.

import { crossSiteRefusal, crossSiteWrite, databaseFailure } from "@/lib/api";
import { requireAgencyUser } from "@/lib/session";
import { maxUploadBytes, maxVideoUploadBytes, readPlacement, storeFile, tooLargeResponse, uploadLimit } from "@/lib/storage";
import { getDb } from "@/db/client";
import { requestLimit, tooManyRequests, withinLimit } from "@/db/requestLimits";

const integer = (value: FormDataEntryValue | null) => (typeof value === "string" && /^\d{1,16}$/.test(value) ? Number(value) : null);

export async function POST(request: Request) {
  // Outside src/proxy.ts (large uploads): the cross-site check is made here.
  if (crossSiteWrite(request)) return crossSiteRefusal();
  const auth = await requireAgencyUser();
  if ("response" in auth) return auth.response;
  if (!(await withinLimit(getDb(), `upload:${auth.user.id}`, requestLimit.uploads()))) return tooManyRequests();
  // Refused before reading the body when it announces more than any limit (plus the form's envelope);
  // the file's own limit is checked once its type and place are read.
  const largest = Math.max(maxUploadBytes(), maxVideoUploadBytes());
  if (Number(request.headers.get("content-length") ?? 0) > largest + 64 * 1024) return tooLargeResponse(largest);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "Envoi invalide" }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return Response.json({ error: "Aucun fichier" }, { status: 400 });

  const projectId = integer(form.get("projectId"));
  const livrableId = integer(form.get("livrableId"));
  const version = integer(form.get("version"));
  const kind = form.get("kind");
  const placement = readPlacement(kind, projectId, livrableId, version);
  if (!placement) return Response.json({ error: "Emplacement du fichier invalide" }, { status: 400 });
  if (file.size > uploadLimit(file.type, placement)) return tooLargeResponse(uploadLimit(file.type, placement));

  try {
    const stored = await storeFile(
      getDb(),
      auth.user.organizationId,
      { content: Buffer.from(await file.arrayBuffer()), mimeType: file.type || "application/octet-stream", name: file.name || null, uploadedBy: auth.user.id },
      placement,
    );
    return Response.json(stored);
  } catch (error) {
    return databaseFailure("api/files", error);
  }
}
