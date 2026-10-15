// Imported files. The interface reads files as data URLs; the server stores their content once
// and puts a /api/files/:id address in their place, which <img> and react-pdf load the same way.

import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Db } from "./client";
import { files } from "./schema";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** Fields that may hold an imported file. */
const fileFields = new Set(["fileData", "coverData"]);
const dataUrlPattern = /^data:([^;,]+)?((?:;[^;,]+)*);base64,/;

export const fileHref = (id: string) => `/api/files/${id}`;

async function storeDataUrl(tx: Tx, dataUrl: string): Promise<string | null> {
  const match = dataUrlPattern.exec(dataUrl);
  if (!match) return null;
  const content = Buffer.from(dataUrl.slice(match[0].length), "base64");
  const id = createHash("sha256").update(content).digest("hex");
  await tx
    .insert(files)
    .values({ id, mimeType: match[1] || "application/octet-stream", size: content.length, content })
    .onConflictDoNothing();
  return fileHref(id);
}

/**
 * Copy of `value` where every data URL in a file field (at any depth: deliverables, trash snapshots)
 * is stored and replaced by its address. `stored` counts the files met.
 */
export async function extractFiles<T>(tx: Tx, value: T, stored = { count: 0 }): Promise<T> {
  if (Array.isArray(value)) return (await Promise.all(value.map((item) => extractFiles(tx, item, stored)))) as T;
  if (!value || typeof value !== "object") return value;
  const entries = await Promise.all(
    Object.entries(value).map(async ([key, field]) => {
      if (fileFields.has(key) && typeof field === "string" && field.startsWith("data:")) {
        const href = await storeDataUrl(tx, field);
        if (href) {
          stored.count += 1;
          return [key, href];
        }
      }
      return [key, await extractFiles(tx, field, stored)];
    }),
  );
  return Object.fromEntries(entries) as T;
}

export async function readStoredFile(db: Db, id: string) {
  const [file] = await db.select().from(files).where(eq(files.id, id)).limit(1);
  return file ?? null;
}
