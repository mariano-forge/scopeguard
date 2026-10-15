// Imported file by its content hash (see src/db/files.ts). The content never changes for an id.

import { getDb } from "@/db/client";
import { readStoredFile } from "@/db/files";

export async function GET(_request: Request, context: RouteContext<"/api/files/[id]">) {
  const { id } = await context.params;
  if (!/^[0-9a-f]{64}$/.test(id)) return new Response(null, { status: 404 });

  try {
    const file = await readStoredFile(getDb(), id);
    if (!file) return new Response(null, { status: 404 });
    return new Response(new Uint8Array(file.content), {
      headers: {
        "Content-Type": file.mimeType,
        "Content-Length": String(file.size),
        "Cache-Control": "private, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    console.error("[api/files]", error);
    return new Response(null, { status: 503 });
  }
}
