// Browser side of imports: the file goes straight to the storage (src/lib/storage.ts, direct uploads),
// so its size is not capped by the app's host. The page computes the file's SHA-256; the server
// computes it again from what the storage received before recording the file.

export type UploadPlacement =
  | { kind: "version"; projectId: number; livrableId: number; version: number }
  | { kind: "cover"; projectId: number; livrableId: number }
  | { kind: "request"; projectId: number; livrableId: number };

const post = async (url: string, body: unknown) => {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
  const json = (await response?.json().catch(() => null)) as Record<string, unknown> | null;
  return { ok: Boolean(response?.ok), json };
};

/** Imports a file; returns its address (/api/files/<id>) or the reason it failed. */
export async function uploadFile(file: File, placement: UploadPlacement): Promise<{ href: string } | { error: string }> {
  const fallback = { error: "L’import n’a pas abouti. Réessayez." };
  // Without Web Crypto (a page not served over HTTPS or localhost), the file goes through the server.
  if (!globalThis.crypto?.subtle) return throughServer(file, placement, fallback);
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  const sha256 = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  const type = file.type || "application/octet-stream";

  const prepared = await post("/api/files/upload", { name: file.name, type, size: file.size, sha256, ...placement });
  if (!prepared.ok) return { error: (prepared.json?.error as string) ?? fallback.error };
  const uploadUrl = prepared.json?.uploadUrl as string | null;
  if (uploadUrl) {
    const sent = await fetch(uploadUrl, { method: "PUT", headers: { "x-ms-blob-type": "BlockBlob", "Content-Type": type }, body: file }).catch(() => null);
    if (!sent?.ok) return fallback;
  }
  const completed = await post("/api/files/complete", { token: prepared.json?.token });
  if (!completed.ok || typeof completed.json?.href !== "string") return { error: (completed.json?.error as string) ?? fallback.error };
  return { href: completed.json.href };
}

async function throughServer(file: File, placement: UploadPlacement, fallback: { error: string }) {
  const form = new FormData();
  form.set("file", file);
  for (const [key, value] of Object.entries(placement)) form.set(key, String(value));
  const response = await fetch("/api/files", { method: "POST", body: form }).catch(() => null);
  const body = (await response?.json().catch(() => null)) as { href?: string; error?: string } | null;
  if (!response?.ok || !body?.href) return { error: body?.error ?? fallback.error };
  return { href: body.href };
}
