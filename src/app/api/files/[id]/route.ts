// An imported file, for whoever may see it: a member of its agency (in Kora, or in the panel on the
// staging site), or a verified client invited to a review that shows it (its version's file or cover,
// or the capture of a request they see). Answers with a redirect to a read-only address valid a few
// minutes, a video's as long as it lasts (src/lib/storage.ts); anyone else gets 404, so the address
// reveals nothing. With ?download, the same file is saved under its name instead of shown (the canvas's
// « Télécharger le livrable »), to the same people.

import { and, eq, inArray, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { getDb } from "@/db/client";
import { expired, visibleToClient } from "@/db/reviewAccess";
import { isInvited, reviewSessionCookie, reviewSessionEmail, siteSessionCookie } from "@/db/reviewAuth";
import { comments, deliverables, reviewLinks, storedFiles } from "@/db/schema";
import type { Db } from "@/db/client";
import { fileHref, fileLinkSeconds, readableUrl, videoLinkSeconds } from "@/lib/storage";
import { readVideoDuration } from "@/lib/timecode";
import { getCurrentUser, isMemberOf } from "@/lib/session";
import { siteAgencyMember } from "@/lib/siteAgency";

const notFound = () => new Response(null, { status: 404 });

/** A verified client sees the file when one of the reviews they are invited to shows it. */
async function clientMaySee(db: Db, org: string, id: string) {
  // The review page's session, or the one of Kora's panel on the staging site (partitioned).
  const jar = await cookies();
  const email = await reviewSessionEmail(db, jar.get(reviewSessionCookie)?.value ?? jar.get(siteSessionCookie)?.value);
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
  if (versions.some(({ data }) => (data as Record<string, unknown>).fileData === href || (data as Record<string, unknown>).coverData === href)) return true;
  // The capture of a request they see on one of those versions: joined by the agency (src/lib/requestSource.ts)
  // or taken on the staging site (src/lib/siteCapture.ts).
  const captureOf = (data: Record<string, unknown>) => [(data.source as Record<string, unknown> | undefined)?.capture, (data.site as Record<string, unknown> | undefined)?.capture];
  const withCapture = (
    await db
      .select({ id: comments.id, data: comments.data })
      .from(comments)
      .where(and(eq(comments.organizationId, org), inArray(comments.deliverableId, links.map((link) => link.deliverableId!))))
  ).filter(({ data }) => captureOf(data as Record<string, unknown>).includes(href));
  return withCapture.some((comment) => visibleToClient(comment.data as Record<string, unknown>));
}

/** How long a file's address lasts: a video's, by the longest length its versions state. */
async function linkSeconds(db: Db, file: { id: string; organizationId: string; mimeType: string }) {
  if (!file.mimeType.startsWith("video/")) return fileLinkSeconds();
  const versions = await db
    .select({ data: deliverables.data })
    .from(deliverables)
    .where(and(eq(deliverables.organizationId, file.organizationId), sql`${deliverables.data}->>'fileData' = ${fileHref(file.id)}`));
  const duration = Math.max(0, ...versions.map(({ data }) => readVideoDuration((data as Record<string, unknown>).duration) ?? 0));
  return duration ? videoLinkSeconds(duration) : fileLinkSeconds();
}

export async function GET(request: Request, context: RouteContext<"/api/files/[id]">) {
  const { id } = await context.params;
  try {
    const db = getDb();

    if (!/^[0-9a-f-]{36}$/.test(id)) return notFound();
    const [file] = await db.select().from(storedFiles).where(eq(storedFiles.id, id)).limit(1);
    if (!file) return notFound();
    const user = await getCurrentUser();
    // A member in Kora's panel on the staging site reads the agency's files as in Kora (src/lib/siteAgency.ts).
    const member = user ? await isMemberOf(user.id, file.organizationId) : (await siteAgencyMember())?.member.organizationId === file.organizationId;
    const allowed = member || (await clientMaySee(db, file.organizationId, id));
    if (!allowed) return notFound();
    // The address changes with every request (it expires): never cached.
    const disposition = new URL(request.url).searchParams.has("download") ? "attachment" : "inline";
    return new Response(null, { status: 302, headers: { Location: await readableUrl(file, await linkSeconds(db, file), disposition), "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("[api/files]", error);
    return new Response(null, { status: 503 });
  }
}
