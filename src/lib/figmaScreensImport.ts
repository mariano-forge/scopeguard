// Browser side of copying Figma screens into Kora (US-054, step 2c, src/db/figmaScreens.ts): Figma draws the
// screens picked in one request, then each one is copied by the server, one request each, so the page can
// tell how far it got and a slow screen never holds the others. Then the deliverable is made from them.

import type { ScreenFormat } from "./figmaScreens";

export type CopiedScreen = { id: string; fileData: string; mimeType: string };

async function post<T>(url: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
  const answer = (await response?.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!response?.ok || !answer) throw new Error(answer?.error ?? "L’import des écrans n’a pas abouti. Réessayez.");
  return answer;
}

/** Copies the screens `ids` (in that order) for a deliverable version; throws with what to tell the agency. */
export async function copyFigmaScreens(input: {
  fileKey: string;
  receipt: string;
  ids: string[];
  format: ScreenFormat;
  placement: { projectId: number; livrableId: number; version: number };
  onProgress: (done: number, total: number) => void;
}): Promise<CopiedScreen[]> {
  const base = `/api/integrations/figma/files/${input.fileKey}/screens`;
  const { ticket, drawn } = await post<{ ticket: string; drawn: string[] }>(`${base}/draw`, { receipt: input.receipt, ids: input.ids, format: input.format });
  const ids = input.ids.filter((id) => drawn.includes(id));
  const copied: CopiedScreen[] = [];
  input.onProgress(0, ids.length);
  for (const id of ids) {
    const stored = await post<{ fileData: string; mimeType: string }>(`${base}/store`, { ticket, id, ...input.placement });
    copied.push({ id, ...stored });
    input.onProgress(copied.length, ids.length);
  }
  return copied;
}
