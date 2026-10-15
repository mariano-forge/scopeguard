// Files inside the shared state. Pages refer to imported files by their address (/api/files/<id>),
// uploaded beforehand through POST /api/files. A data URL that still reaches the server (an older
// page) is stored in the agency's container and replaced by its address.

import { eq } from "drizzle-orm";
import { storeFile } from "@/lib/storage";
import type { Db } from "./client";
import { files } from "./schema";

/** Fields that may hold an imported file. */
const fileFields = new Set(["fileData", "coverData"]);
const dataUrlPattern = /^data:([^;,]+)?((?:;[^;,]+)*);base64,/;

/**
 * Copy of `value` where every data URL in a file field (at any depth: deliverables, trash snapshots)
 * is stored and replaced by its address. `stored` counts the files met.
 */
export async function extractFiles<T>(db: Db, org: string, value: T, stored = { count: 0 }): Promise<T> {
  if (Array.isArray(value)) return (await Promise.all(value.map((item) => extractFiles(db, org, item, stored)))) as T;
  if (!value || typeof value !== "object") return value;
  const entries = await Promise.all(
    Object.entries(value).map(async ([key, field]) => {
      const match = fileFields.has(key) && typeof field === "string" ? dataUrlPattern.exec(field) : null;
      if (match) {
        const content = Buffer.from((field as string).slice(match[0].length), "base64");
        const file = await storeFile(db, org, { content, mimeType: match[1] || "application/octet-stream", name: null, uploadedBy: null }, { kind: "other" });
        stored.count += 1;
        return [key, file.href];
      }
      return [key, await extractFiles(db, org, field, stored)];
    }),
  );
  return Object.fromEntries(entries) as T;
}

/** A file imported before Azure storage (kept in Postgres, named by its SHA-256). */
export async function readLegacyFile(db: Db, id: string) {
  const [file] = await db.select().from(files).where(eq(files.id, id)).limit(1);
  return file ?? null;
}
