// What an extraction proposes for a project's scope, read from pasted text or one of its PDFs (a quote, a
// brief): things included and things excluded. A proposal only: the agency reviews each item, then adds
// those it keeps to its draft, which it saves as any other (src/lib/projectScope.ts). The server never
// writes a scope from an extraction. Shared by the page and the server (src/lib/scopeExtractor.ts).

import { scopeLimits } from "./projectScope";

export type ExtractedKind = "included" | "excluded";
export type ExtractedItem = { kind: ExtractedKind; title: string; quantity?: number; unit?: string; source?: string };

export const extractionLimits = { text: 50_000, items: 200 };

const short = (value: unknown, max: number) => (typeof value === "string" && value.trim() ? value.trim().slice(0, max) : undefined);

/** Asks the server to read a text or one of the agency's PDFs; the items proposed, or why not. */
export async function requestExtraction(projectId: number, input: { text: string } | { file: string }): Promise<{ items: ExtractedItem[] } | { error: string }> {
  const response = await fetch(`/api/projects/${projectId}/scope/extraction`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) }).catch(() => null);
  const answer = (await response?.json().catch(() => null)) as { items?: unknown; error?: string } | null;
  if (!response?.ok) return { error: answer?.error ?? "L’extraction n’a pas pu être lancée. Vérifiez votre connexion." };
  return { items: readExtracted(answer?.items) };
}

/** What an extractor answered, kept to what a scope may hold: bounded words, a real quantity, at most 200 items. */
export function readExtracted(value: unknown): ExtractedItem[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, extractionLimits.items).flatMap((raw) => {
    const item = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    const kind = item.kind === "excluded" ? "excluded" : item.kind === "included" ? "included" : undefined;
    const title = short(item.title, scopeLimits.title);
    if (!kind || !title) return [];
    const quantity = typeof item.quantity === "number" && Number.isFinite(item.quantity) && item.quantity >= 0 && item.quantity <= 1_000_000 ? item.quantity : undefined;
    return [{ kind, title, quantity, unit: short(item.unit, scopeLimits.unit), source: short(item.source, scopeLimits.source) }];
  });
}
