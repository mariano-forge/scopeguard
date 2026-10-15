// Imported files in Azure Blob Storage: one private container per agency, files arranged like the
// agency's work (projets/<id>/livrables/<id>/v<n>/…). Pages never reach the storage directly:
// /api/files/<id> checks who asks, then redirects to a read-only address valid 5 minutes (SAS).
//
//   STORAGE_TARGET=local    -> Azurite (docker-compose.yml), the Azure Storage emulator
//   STORAGE_TARGET=remote   -> the Azure account in STORAGE_URL_REMOTE
//
// Each agency's container is recorded in agency_storage with its account, so an agency can get an
// account of its own later. Authentication is the account key for now; Managed Identity in production.

import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { BlobSASPermissions, BlobServiceClient, generateBlobSASQueryParameters, StorageSharedKeyCredential } from "@azure/storage-blob";
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { organizations } from "@/db/auth-schema";
import { agencyStorage, storedFiles } from "@/db/schema";

export type StorageTarget = "local" | "remote";

function storageConfig() {
  const target = (process.env.STORAGE_TARGET ?? "local") as StorageTarget;
  if (target !== "local" && target !== "remote") throw new Error(`STORAGE_TARGET must be "local" or "remote", not "${target}".`);
  const suffix = target === "local" ? "LOCAL" : "REMOTE";
  const url = process.env[`STORAGE_URL_${suffix}`]?.replace(/\/$/, "");
  const account = process.env[`STORAGE_ACCOUNT_${suffix}`];
  const key = process.env[`STORAGE_KEY_${suffix}`];
  if (!url || !account || !key) throw new Error(`STORAGE_TARGET is "${target}" but STORAGE_URL_${suffix}, STORAGE_ACCOUNT_${suffix} or STORAGE_KEY_${suffix} is missing (see .env.example).`);
  return { url, credential: new StorageSharedKeyCredential(account, key) };
}

/** Largest file an agency can import (MAX_UPLOAD_MB, 50 by default). */
export const maxUploadBytes = () => Math.max(1, Number(process.env.MAX_UPLOAD_MB) || 50) * 1024 * 1024;

const globalForStorage = globalThis as unknown as { koraStorage?: { service: BlobServiceClient; credential: StorageSharedKeyCredential; ready: Promise<void> } };

function storage() {
  if (!globalForStorage.koraStorage) {
    const { url, credential } = storageConfig();
    const service = new BlobServiceClient(url, credential);
    globalForStorage.koraStorage = { service, credential, ready: allowBrowserReads(service) };
  }
  return globalForStorage.koraStorage;
}

/**
 * The PDF viewer fetches files: after the redirect from /api/files its origin is "null", so the
 * account answers reads from any origin. Harmless: containers are private and a read needs a SAS.
 */
async function allowBrowserReads(service: BlobServiceClient) {
  const properties = await service.getProperties();
  const cors = properties.cors ?? [];
  if (cors.some((rule) => rule.allowedOrigins === "*" && rule.allowedMethods.includes("GET"))) return;
  await service.setProperties({
    cors: [...cors, { allowedOrigins: "*", allowedMethods: "GET,HEAD", allowedHeaders: "*", exposedHeaders: "*", maxAgeInSeconds: 3600 }],
  });
}

/** Container names: 3–63 lower-case letters, digits and single hyphens. */
function containerName(slug: string) {
  const base = slug
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return `agence-${base || randomUUID().slice(0, 8)}`.slice(0, 63).replace(/-$/, "");
}

/** The agency's container, created on its first file. */
async function containerFor(db: Db, org: string) {
  const { service, ready } = storage();
  await ready;
  let [row] = await db.select().from(agencyStorage).where(eq(agencyStorage.organizationId, org)).limit(1);
  if (!row) {
    const [agency] = await db.select({ slug: organizations.slug }).from(organizations).where(eq(organizations.id, org)).limit(1);
    await db.insert(agencyStorage).values({ organizationId: org, container: containerName(agency?.slug ?? org) }).onConflictDoNothing();
    [row] = await db.select().from(agencyStorage).where(eq(agencyStorage.organizationId, org)).limit(1);
  }
  if (row.accountUrl) throw new Error("Agency storage accounts of their own are not supported yet.");
  const container = service.getContainerClient(row.container);
  await container.createIfNotExists({ metadata: { organization: org } });
  return container;
}

const extensions: Record<string, string> = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/svg+xml": "svg",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
};

function extensionOf(name: string | null, mimeType: string) {
  const fromName = name?.toLowerCase().match(/\.([a-z0-9]{1,8})$/)?.[1];
  return fromName ?? extensions[mimeType] ?? "bin";
}

/** Blob metadata only takes ASCII. */
const ascii = (value: string) => value.normalize("NFD").replace(/[^\x20-\x7e]/g, "").slice(0, 200);

export type FilePlacement =
  /** A version of a deliverable: projets/<projectId>/livrables/<livrableId>/v<version>/<sha256>.<ext> */
  | { kind: "version"; projectId: number; livrableId: number; version: number }
  /** The cover of a deliverable: projets/<projectId>/livrables/<livrableId>/couverture/<sha256>.<ext> */
  | { kind: "cover"; projectId: number; livrableId: number }
  /** A file that reached the server without its place (older pages): divers/<sha256>.<ext> */
  | { kind: "other" };

function pathOf(placement: FilePlacement, sha256: string, extension: string) {
  const name = `${sha256}.${extension}`;
  if (placement.kind === "other") return `divers/${name}`;
  const livrable = `projets/${placement.projectId}/livrables/${placement.livrableId}`;
  return placement.kind === "version" ? `${livrable}/v${placement.version}/${name}` : `${livrable}/couverture/${name}`;
}

/** Stores a file in the agency's container and records it; returns its id and address. */
export async function storeFile(
  db: Db,
  org: string,
  file: { content: Buffer; mimeType: string; name: string | null; uploadedBy: string | null },
  placement: FilePlacement,
) {
  const sha256 = createHash("sha256").update(file.content).digest("hex");
  const container = await containerFor(db, org);
  const path = pathOf(placement, sha256, extensionOf(file.name, file.mimeType));
  await container.getBlockBlobClient(path).uploadData(file.content, {
    blobHTTPHeaders: { blobContentType: file.mimeType },
    metadata: { organization: org, sha256, ...(file.name ? { originalname: ascii(file.name) } : {}) },
  });
  const id = randomUUID();
  await db.insert(storedFiles).values({
    id,
    organizationId: org,
    container: container.containerName,
    path,
    sha256,
    mimeType: file.mimeType,
    size: file.content.length,
    originalName: file.name,
    uploadedBy: file.uploadedBy,
  });
  return { id, href: fileHref(id), sha256, size: file.content.length };
}

export const fileHref = (id: string) => `/api/files/${id}`;

/** Read-only address of a stored file, valid 5 minutes, opened in the page (not downloaded). */
export async function readableUrl(file: { container: string; path: string; originalName: string | null }) {
  const { service, credential, ready } = storage();
  await ready;
  const blob = service.getContainerClient(file.container).getBlobClient(file.path);
  const now = Date.now();
  const sas = generateBlobSASQueryParameters(
    {
      containerName: file.container,
      blobName: file.path,
      permissions: BlobSASPermissions.parse("r"),
      startsOn: new Date(now - 60 * 1000),
      expiresOn: new Date(now + 5 * 60 * 1000),
      contentDisposition: file.originalName ? `inline; filename*=UTF-8''${encodeURIComponent(file.originalName)}` : "inline",
    },
    credential,
  );
  return `${blob.url}?${sas.toString()}`;
}
