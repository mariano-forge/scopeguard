// Agency: POST /api/files/complete { token } once the file is sent to the storage. The server reads
// it back and checks its SHA-256 itself before recording it (src/lib/storage.ts completeUpload).
// Returns { id, href, sha256, size }.

import { getDb } from "@/db/client";
import { crossSiteRefusal, crossSiteWrite, databaseFailure } from "@/lib/api";
import { readBody } from "@/lib/reviewViewer";
import { requireAgencyUser } from "@/lib/session";
import { completeUpload } from "@/lib/storage";

export async function POST(request: Request) {
  if (crossSiteWrite(request)) return crossSiteRefusal();
  const auth = await requireAgencyUser();
  if ("response" in auth) return auth.response;
  const { token } = await readBody(request);
  if (typeof token !== "string" || token.length > 4000) return Response.json({ error: "Envoi invalide" }, { status: 400 });
  try {
    const result = await completeUpload(getDb(), auth.user.organizationId, token);
    if ("error" in result) return Response.json({ error: result.error }, { status: result.status });
    return Response.json(result);
  } catch (error) {
    return databaseFailure("api/files/complete", error);
  }
}
