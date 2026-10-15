// An imported file, for whoever may see it: a member of its agency, or a verified client invited to a
// review that shows it. Answers with a redirect to a read-only address valid 5 minutes
// (src/lib/storage.ts); anyone else gets 404, so the address reveals nothing.

import { and, eq, inArray } from "drizzle-orm";
import { cookies } from "next/headers";
import { getDb } from "@/db/client";
import { readLegacyFile } from "@/db/files";
import { expired } from "@/db/reviewAccess";
import { isInvited, reviewSessionCookie, reviewSessionEmail } from "@/db/reviewAuth";
import { deliverables, reviewLinks, storedFiles } from "@/db/schema";
import type { Db } from "@/db/client";
import { fileHref, readableUrl } from "@/lib/storage";
import { getCurrentUser, isMemberOf } from "@/lib/session";

const notFound = () => new Response(null, { status: 404 });

/** A verified client sees the file when one of the reviews they are invited to shows it. */
async function clientMaySee(db: Db, org: string, id: string) {
  const email = await reviewSessionEmail(db, (await cookies()).get(reviewSessionCookie)?.value);
  if (!email) return false;
  const links = (await db.select().from(reviewLinks).where(and(eq(reviewLinks.organizationId, org), eq(reviewLinks.active, true))))
    .map((row) => ({ ...row, data: row.data as Record<string, unknown> }))
    .filter((row) => row.data.active === true && !expired(row.data) && isInvited(row.data, email) && row.deliverableId !== null);
  if (!links.length) return false;
  const versions = await db
    .select({ data: deliverables.data })
    .from(deliverables)
    .where(and(eq(deliverables.organizationId, org), inArray(deliverables.id, links.map((link) => link.deliverableId!))));
  const href = fileHref(id);
  return versions.some(({ data }) => (data as Record<string, unknown>).fileData === href || (data as Record<string, unknown>).coverData === href);
}

export async function GET(_request: Request, context: RouteContext<"/api/files/[id]">) {
  const { id } = await context.params;
  try {
    const db = getDb();

    // Imported before Azure storage: content in Postgres, named by its SHA-256 (read only, to migrate).
    if (/^[0-9a-f]{64}$/.test(id)) {
      const legacy = await readLegacyFile(db, id);
      if (!legacy) return notFound();
      return new Response(new Uint8Array(legacy.content), {
        headers: { "Content-Type": legacy.mimeType, "Content-Length": String(legacy.size), "Cache-Control": "private, max-age=31536000, immutable" },
      });
    }

    if (!/^[0-9a-f-]{36}$/.test(id)) return notFound();
    const [file] = await db.select().from(storedFiles).where(eq(storedFiles.id, id)).limit(1);
    if (!file) return notFound();
    const user = await getCurrentUser();
    const allowed = (user && (await isMemberOf(user.id, file.organizationId))) || (await clientMaySee(db, file.organizationId, id));
    if (!allowed) return notFound();
    // The address changes with every request (it expires): never cached.
    return new Response(null, { status: 302, headers: { Location: await readableUrl(file), "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("[api/files]", error);
    return new Response(null, { status: 503 });
  }
}
