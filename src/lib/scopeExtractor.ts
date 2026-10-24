// The engine behind « Lancer l'extraction » (src/lib/scopeExtraction.ts): reads pasted text or a PDF and
// proposes the scope's items. Chosen by AI_PROVIDER, the one setting of Kora's AI (src/lib/ai/provider.ts):
// "fake" gives the tests' fixed reading; "anthropic" has no extraction engine yet, so, like no setting at
// all, the page says extraction is not configured and the agency types its items by hand.
//
// To plug in the AI: add a provider here, with the same signature, whose output goes through
// readExtracted (bounds) like every other. The PDF arrives as bytes, read by the server from the agency's
// own files (readOwnPdf, src/lib/storage.ts): never an address the provider could share.

import "server-only";
import { readExtracted, type ExtractedItem } from "./scopeExtraction";

export type ExtractionInput = { text: string } | { pdf: { name: string; bytes: Buffer } };
type Extractor = (input: ExtractionInput) => Promise<unknown>;

/**
 * For the tests only (AI_PROVIDER=fake): no AI, a fixed reading. One item a line, « Title —
 * 5 pages » read as its quantity and unit; the lines after a « Non inclus » heading are exclusions. A PDF
 * gives one item named after it.
 */
const testExtractor: Extractor = async (input) => {
  if ("pdf" in input) return [{ kind: "included", title: `Contenu de ${input.pdf.name}`, source: input.pdf.name }];
  let kind: ExtractedItem["kind"] = "included";
  return input.text.split(/\r?\n/).flatMap((raw) => {
    const line = raw.replace(/^\s*[-•*]\s*/, "").trim();
    if (!line) return [];
    if (/^(non inclus|exclusions?|hors (devis|périmètre))\s*:?$/i.test(line)) {
      kind = "excluded";
      return [];
    }
    if (/^inclus\s*:?$/i.test(line)) {
      kind = "included";
      return [];
    }
    const [title, detail] = line.split(/\s+[—:]\s+/);
    const amount = detail?.match(/^(\d+(?:[.,]\d+)?)\s*(.*)$/);
    const unit = amount?.[2]?.trim();
    return [{ kind, title, quantity: amount ? Number(amount[1]!.replace(",", ".")) : undefined, unit: unit || undefined }];
  });
};

/** The engine for each AI_PROVIDER: Claude's comes when its extraction is written (« anthropic » not yet). */
const providers: Record<string, Extractor> = { fake: testExtractor };

/** The engine configured, or none (extraction not offered yet). */
export const extractionProvider = (): Extractor | undefined => providers[process.env.AI_PROVIDER ?? ""];

export const extractionOff = () =>
  Response.json({ error: "L’extraction automatique n’est pas encore configurée : ajoutez les éléments à la main en attendant.", code: "EXTRACTION_OFF" }, { status: 503 });

/** The items proposed, bounded; an error when the engine failed (said to the agency, detailed in the log). */
export async function extractScope(provider: Extractor, input: ExtractionInput): Promise<{ items: ExtractedItem[] } | { error: string }> {
  try {
    return { items: readExtracted(await provider(input)) };
  } catch (error) {
    console.error("[scope extraction]", error);
    return { error: "L’extraction a échoué. Réessayez, ou ajoutez les éléments à la main." };
  }
}
