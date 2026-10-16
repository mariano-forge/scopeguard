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
import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { BlobSASPermissions, BlobServiceClient, generateBlobSASQueryParameters, StorageSharedKeyCredential } from "@azure/storage-blob";
import { and, eq } from "drizzle-orm";
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
    globalForStorage.koraStorage = { service, credential, ready: allowBrowserTransfers(service) };
  }
  return globalForStorage.koraStorage;
}

/**
 * Browsers talk to the account directly: the PDF viewer reads files (after the redirect from
 * /api/files its origin is "null"), and imports are sent straight to it (PUT). So the account answers
 * any origin. Harmless: containers are private, and every read or write needs its own short SAS.
 */
async function allowBrowserTransfers(service: BlobServiceClient) {
  const properties = await service.getProperties();
  const cors = properties.cors ?? [];
  if (cors.some((rule) => rule.allowedOrigins === "*" && rule.allowedMethods.includes("GET") && rule.allowedMethods.includes("PUT"))) return;
  // Replaces the read-only rule set by earlier versions of this module; other rules are kept.
  const others = cors.filter((rule) => !(rule.allowedOrigins === "*" && rule.allowedMethods === "GET,HEAD"));
  await service.setProperties({
    cors: [...others, { allowedOrigins: "*", allowedMethods: "GET,HEAD,PUT", allowedHeaders: "*", exposedHeaders: "*", maxAgeInSeconds: 3600 }],
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
  /** A capture attached to a request (an e-mail, a message): projets/<projectId>/livrables/<livrableId>/demandes/<sha256>.<ext> */
  | { kind: "request"; projectId: number; livrableId: number }
  /** A file that reached the server without its place (older pages): divers/<sha256>.<ext> */
  | { kind: "other" };

/** The place a page asks for (upload routes): its kind and numeric ids, or null when malformed. */
export function readPlacement(kind: unknown, projectId: number | null, livrableId: number | null, version: number | null): FilePlacement | null {
  if (projectId === null || livrableId === null) return null;
  if (kind === "cover" || kind === "request") return { kind, projectId, livrableId };
  return kind === "version" && version !== null ? { kind: "version", projectId, livrableId, version } : null;
}

function pathOf(placement: FilePlacement, sha256: string, extension: string) {
  const name = `${sha256}.${extension}`;
  if (placement.kind === "other") return `divers/${name}`;
  const livrable = `projets/${placement.projectId}/livrables/${placement.livrableId}`;
  if (placement.kind === "version") return `${livrable}/v${placement.version}/${name}`;
  return placement.kind === "cover" ? `${livrable}/couverture/${name}` : `${livrable}/demandes/${name}`;
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

// ——— Direct uploads: the browser sends the file to the storage itself ———
//
// 1. prepareUpload: the page states the file (name, type, size, SHA-256) and where it belongs; the
//    server answers a write address valid 15 minutes, which may only create that one file (never
//    overwrite one), and a signed token describing it.
// 2. The browser PUTs the file to that address.
// 3. completeUpload: the server reads the file back from the storage and computes its SHA-256 itself;
//    a file that does not match what was stated is deleted and refused. Only then is it recorded.
// Large files never pass through the app's servers (hosts such as Vercel cap a request at 4.5 MB).

const uploadWindowMs = 15 * 60 * 1000;

type UploadClaim = {
  org: string;
  container: string;
  path: string;
  sha256: string;
  size: number;
  mimeType: string;
  name: string | null;
  uploadedBy: string;
  expires: number;
};

function uploadSecret() {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error("BETTER_AUTH_SECRET is not set.");
  return secret;
}

function signClaim(claim: UploadClaim) {
  const body = Buffer.from(JSON.stringify(claim)).toString("base64url");
  return `${body}.${createHmac("sha256", uploadSecret()).update(body).digest("base64url")}`;
}

function readClaim(token: string): UploadClaim | null {
  const [body, mac] = token.split(".");
  if (!body || !mac) return null;
  const expected = Buffer.from(createHmac("sha256", uploadSecret()).update(body).digest("base64url"));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const claim = JSON.parse(Buffer.from(body, "base64url").toString()) as UploadClaim;
    return claim.expires > Date.now() ? claim : null;
  } catch {
    return null;
  }
}

export async function prepareUpload(
  db: Db,
  org: string,
  file: { name: string | null; mimeType: string; size: number; sha256: string; uploadedBy: string },
  placement: FilePlacement,
) {
  const { credential } = storage();
  const container = await containerFor(db, org);
  const path = pathOf(placement, file.sha256, extensionOf(file.name, file.mimeType));
  const claim: UploadClaim = { org, container: container.containerName, path, ...file, expires: Date.now() + uploadWindowMs };
  const blob = container.getBlockBlobClient(path);
  // Already stored (the same file imported again at the same place): nothing to send.
  if (await blob.exists()) return { token: signClaim(claim), uploadUrl: null };
  const sas = generateBlobSASQueryParameters(
    {
      containerName: container.containerName,
      blobName: path,
      // Create only: a write address can never replace a stored file (an approved version's, say).
      permissions: BlobSASPermissions.parse("c"),
      startsOn: new Date(Date.now() - 60 * 1000),
      expiresOn: new Date(claim.expires),
    },
    credential,
  );
  return { token: signClaim(claim), uploadUrl: `${blob.url}?${sas.toString()}` };
}

export async function completeUpload(db: Db, org: string, token: string) {
  const claim = readClaim(token);
  if (!claim || claim.org !== org) return { error: "Envoi invalide ou expiré.", status: 400 } as const;
  const { service, ready } = storage();
  await ready;
  const blob = service.getContainerClient(claim.container).getBlobClient(claim.path);
  const properties = await blob.getProperties().catch(() => null);
  if (!properties) return { error: "Le fichier n’a pas été reçu par le stockage.", status: 400 } as const;

  const hash = createHash("sha256");
  const download = await blob.download();
  for await (const chunk of download.readableStreamBody as AsyncIterable<Buffer>) hash.update(chunk);
  if (properties.contentLength !== claim.size || hash.digest("hex") !== claim.sha256) {
    await blob.deleteIfExists();
    return { error: "Le fichier reçu ne correspond pas à celui annoncé.", status: 400 } as const;
  }

  const [existing] = await db
    .select({ id: storedFiles.id })
    .from(storedFiles)
    .where(and(eq(storedFiles.organizationId, org), eq(storedFiles.path, claim.path)))
    .limit(1);
  const id = existing?.id ?? randomUUID();
  if (!existing)
    await db.insert(storedFiles).values({
      id,
      organizationId: org,
      container: claim.container,
      path: claim.path,
      sha256: claim.sha256,
      mimeType: claim.mimeType,
      size: claim.size,
      originalName: claim.name,
      uploadedBy: claim.uploadedBy,
    });
  return { id, href: fileHref(id), sha256: claim.sha256, size: claim.size };
}
