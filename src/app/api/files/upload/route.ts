// Agency: POST /api/files/upload { name, type, size, sha256, kind, projectId, livrableId, version }
// -> { token, uploadUrl } to send a file straight to the storage (src/lib/storage.ts prepareUpload).
// uploadUrl is null when the same file is already stored at that place: complete it directly.

import { getDb } from "@/db/client";
import { requestLimit, tooManyRequests, withinLimit } from "@/db/requestLimits";
import { crossSiteRefusal, crossSiteWrite, databaseFailure } from "@/lib/api";
import { readBody } from "@/lib/reviewViewer";
import { requireAgencyUser } from "@/lib/session";
import { prepareUpload, readPlacement, tooLargeResponse, uploadLimit } from "@/lib/storage";

const integer = (value: unknown) => (typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null);

export async function POST(request: Request) {
  // Outside src/proxy.ts (file routes): the cross-site check is made here.
  if (crossSiteWrite(request)) return crossSiteRefusal();
  const auth = await requireAgencyUser();
  if ("response" in auth) return auth.response;
  const body = await readBody(request);

  const size = integer(body.size);
  const sha256 = typeof body.sha256 === "string" && /^[0-9a-f]{64}$/.test(body.sha256) ? body.sha256 : null;
  const name = typeof body.name === "string" ? body.name.slice(0, 200) : null;
  const mimeType = typeof body.type === "string" && /^[\w.+-]+\/[\w.+-]+$/.test(body.type) ? body.type : "application/octet-stream";
  const [projectId, livrableId, version] = [integer(body.projectId), integer(body.livrableId), integer(body.version)];
  const placement = readPlacement(body.kind, projectId, livrableId, version);
  if (!size || !sha256 || !placement) return Response.json({ error: "Envoi invalide" }, { status: 400 });
  if (size > uploadLimit(mimeType, placement)) return tooLargeResponse(uploadLimit(mimeType, placement));

  try {
    const db = getDb();
    if (!(await withinLimit(db, `upload:${auth.user.id}`, requestLimit.uploads()))) return tooManyRequests();
    return Response.json(await prepareUpload(db, auth.user.organizationId, { name, mimeType, size, sha256, uploadedBy: auth.user.id }, placement));
  } catch (error) {
    return databaseFailure("api/files/upload", error);
  }
}
