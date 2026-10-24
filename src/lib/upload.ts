// Browser side of imports: the file goes straight to the storage (src/lib/storage.ts, direct uploads),
// so its size is not capped by the app's host. The page computes the file's SHA-256; the server
// computes it again from what the storage received before recording the file.
//
// A file of any size, up to a film of a few GB: it is read piece by piece (8 MB), never whole, to compute
// its SHA-256 (@noble/hashes, in plain JavaScript: the browser's own digest takes a whole file at once,
// and WebAssembly is closed by the pages' policy, src/lib/securityHeaders.ts); past one piece, it is
// sent in blocks, 4 at a time, a failed one sent again on its own, then assembled by the storage.

import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";

export type UploadPlacement =
  | { kind: "version"; projectId: number; livrableId: number; version: number }
  | { kind: "cover"; projectId: number; livrableId: number }
  | { kind: "request"; projectId: number; livrableId: number }
  | { kind: "scope"; projectId: number };

/** How far an import is, from 0 to 1: reading the file, then sending it. */
export type UploadProgress = (step: "reading" | "sending", done: number) => void;

/** A piece of a file read or sent at once (8 MB); a larger file is sent in blocks of this size. */
export const uploadPieceBytes = 8 * 1024 * 1024;
const pieceBytes = uploadPieceBytes;
const blocksAtOnce = 4;
const triesPerBlock = 3;

const post = async (url: string, body: unknown) => {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
  const json = (await response?.json().catch(() => null)) as Record<string, unknown> | null;
  return { ok: Boolean(response?.ok), json };
};

/** The SHA-256 of a file read piece by piece: memory holds one piece, whatever the file's size. */
async function sha256Of(file: File, onProgress?: UploadProgress) {
  const hasher = sha256.create();
  for (let offset = 0; offset < file.size; offset += pieceBytes) {
    hasher.update(new Uint8Array(await file.slice(offset, offset + pieceBytes).arrayBuffer()));
    onProgress?.("reading", Math.min(1, (offset + pieceBytes) / file.size));
  }
  return bytesToHex(hasher.digest());
}

/** Sends a file of more than one piece in blocks, then asks the storage to assemble them in order. */
async function sendInBlocks(uploadUrl: string, file: File, type: string, onProgress?: UploadProgress) {
  const count = Math.ceil(file.size / pieceBytes);
  // Block ids: base64, all of the same length (the storage's rule).
  const ids = Array.from({ length: count }, (_, index) => btoa(`bloc-${String(index).padStart(6, "0")}`));
  let next = 0;
  let sent = 0;
  const sendBlock = async (index: number) => {
    for (let attempt = 0; attempt < triesPerBlock; attempt++) {
      const answer = await fetch(`${uploadUrl}&comp=block&blockid=${encodeURIComponent(ids[index])}`, {
        method: "PUT",
        body: file.slice(index * pieceBytes, (index + 1) * pieceBytes),
      }).catch(() => null);
      if (answer?.ok) return true;
    }
    return false;
  };
  const worker = async () => {
    while (next < count) {
      const index = next++;
      if (!(await sendBlock(index))) throw new Error(`block ${index} not sent`);
      onProgress?.("sending", ++sent / count);
    }
  };
  await Promise.all(Array.from({ length: Math.min(blocksAtOnce, count) }, worker));
  const list = `<?xml version="1.0" encoding="utf-8"?><BlockList>${ids.map((id) => `<Latest>${id}</Latest>`).join("")}</BlockList>`;
  const assembled = await fetch(`${uploadUrl}&comp=blocklist`, { method: "PUT", headers: { "Content-Type": "application/xml", "x-ms-blob-content-type": type }, body: list }).catch(() => null);
  return Boolean(assembled?.ok);
}

/** Imports a file; returns its address (/api/files/<id>) or the reason it failed. */
export async function uploadFile(file: File, placement: UploadPlacement, onProgress?: UploadProgress): Promise<{ href: string } | { error: string }> {
  const fallback = { error: "L’import n’a pas abouti. Réessayez." };
  const sha256 = await sha256Of(file, onProgress);
  const type = file.type || "application/octet-stream";

  const prepared = await post("/api/files/upload", { name: file.name, type, size: file.size, sha256, ...placement });
  if (!prepared.ok) return { error: (prepared.json?.error as string) ?? fallback.error };
  const uploadUrl = prepared.json?.uploadUrl as string | null;
  if (uploadUrl) {
    const sent =
      file.size > pieceBytes
        ? await sendInBlocks(uploadUrl, file, type, onProgress).catch(() => false)
        : Boolean((await fetch(uploadUrl, { method: "PUT", headers: { "x-ms-blob-type": "BlockBlob", "Content-Type": type }, body: file }).catch(() => null))?.ok);
    if (!sent) return fallback;
  }
  const completed = await post("/api/files/complete", { token: prepared.json?.token });
  if (!completed.ok || typeof completed.json?.href !== "string") return { error: (completed.json?.error as string) ?? fallback.error };
  return { href: completed.json.href };
}

/**
 * The capture of the window when a request is placed on the staging site, from Kora's panel there
 * (src/lib/siteCapture.ts): small, sent through the server. Its address, or null when it failed (the
 * request then goes without it).
 */
export async function uploadSiteCapture(token: string, capture: Blob) {
  const form = new FormData();
  form.set("file", capture, capture.type === "image/png" ? "capture.png" : "capture.jpg");
  const response = await fetch(`/api/review/${encodeURIComponent(token)}/site/capture`, { method: "POST", body: form }).catch(() => null);
  const body = (await response?.json().catch(() => null)) as { href?: string } | null;
  return response?.ok && typeof body?.href === "string" ? body.href : null;
}
