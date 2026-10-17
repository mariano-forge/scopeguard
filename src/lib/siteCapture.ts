// The capture of the window when a request is placed on the staging site (US-048): made in the
// visitor's browser by the toolbar, sent by the panel, stored with the requests' captures
// (projets/<id>/livrables/<id>/demandes/, src/lib/storage.ts).
//
// A request names its capture by address: the server only accepts one that the same person sent,
// as an image. Otherwise a client could name any file of the agency (an unshared version) in their
// request, then open it through /api/files.

import "server-only";
import { and, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import type { ReviewAccess } from "@/db/reviewAccess";
import { deliverables, storedFiles } from "@/db/schema";
import { maxUploadBytes, storeFile } from "./storage";

/** A capture is a window: a few hundred kilobytes; never more than the import limit. */
export const maxCaptureBytes = () => Math.min(3 * 1024 * 1024, maxUploadBytes());

/** Who sent a capture, as stored_files.uploaded_by says it: a member's id, or the client's address. */
export const clientUploader = (email: string) => `client:${email}`;

/** The image type the bytes start with (not the type the browser claims); null for anything else. */
export function imageTypeOf(content: Buffer) {
  if (content.length > 3 && content[0] === 0xff && content[1] === 0xd8 && content[2] === 0xff) return "image/jpeg";
  if (content.length > 8 && content.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  return null;
}

/** Stores the capture with the requests of the shared deliverable; null when it is not an image. */
export async function storeSiteCapture(db: Db, access: ReviewAccess, content: Buffer, uploader: string) {
  const mimeType = imageTypeOf(content);
  if (!mimeType) return null;
  const org = access.organizationId;
  const [record] = await db.select({ projectId: deliverables.projectId, name: deliverables.name }).from(deliverables).where(and(eq(deliverables.organizationId, org), eq(deliverables.id, access.deliverableId))).limit(1);
  if (!record) return null;
  // The deliverable's first version names its folder, as for the agency's imports (src/app/(agency)/routes.ts livrableIdOf).
  const versions = await db.select({ id: deliverables.id, projectId: deliverables.projectId }).from(deliverables).where(and(eq(deliverables.organizationId, org), eq(deliverables.name, record.name)));
  const livrableId = Math.min(...versions.filter((version) => (version.projectId ?? 1) === (record.projectId ?? 1)).map((version) => version.id));
  const name = `capture-site.${mimeType === "image/png" ? "png" : "jpg"}`;
  return storeFile(db, org, { content, mimeType, name, uploadedBy: uploader }, { kind: "request", projectId: record.projectId ?? 1, livrableId });
}

/** Whether `href` is an image of the agency that `uploader` sent: the only capture a request of theirs may name. */
export async function ownCapture(db: Db, organizationId: string, href: string, uploader: string) {
  const [file] = await db
    .select({ mimeType: storedFiles.mimeType, uploadedBy: storedFiles.uploadedBy })
    .from(storedFiles)
    .where(and(eq(storedFiles.organizationId, organizationId), eq(storedFiles.id, href.split("/").at(-1)!)))
    .limit(1);
  return Boolean(file && file.uploadedBy === uploader && file.mimeType.startsWith("image/"));
}
