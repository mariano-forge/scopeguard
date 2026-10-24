// The engine behind « Lancer l'extraction » (src/lib/scopeExtraction.ts): reads pasted text or a PDF and
// proposes the scope's items. Chosen by AI_PROVIDER, the one setting of Kora's AI (src/lib/ai/provider.ts):
// "azure" reads with GPT on Azure (src/lib/ai/azureOpenAI.ts); "fake" gives the tests' fixed reading;
// "anthropic" has no extraction engine yet, so, like no setting at all, the page says extraction is not
// configured and the agency types its items by hand.
//
// Every engine's output goes through readExtracted (bounds). The PDF arrives as bytes, read by the server
// from the agency's own files (readOwnPdf, src/lib/storage.ts): a model gets its text (src/lib/pdfText.ts),
// never the file nor an address the provider could share.

import "server-only";
import { azureOptionsFromEnv, azureScopeReader } from "./ai/azureOpenAI";
import { ExtractionRefusal, readingText, type ExtractionInput, type Extractor } from "./ai/scopeReading";
import { readExtracted, type ExtractedItem } from "./scopeExtraction";

/**
 * For the tests only (AI_PROVIDER=fake): no AI, a fixed reading. One item a line, « Title —
 * 5 pages » read as its quantity and unit; the lines after a « Non inclus » heading are exclusions. A PDF
 * is read as the models get it, its words (readingText): the tests go through pdf.js on the server too.
 */
const testExtractor: Extractor = readingText(async (text) => {
  let kind: ExtractedItem["kind"] = "included";
  return text.split(/\r?\n/).flatMap((raw) => {
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
});

/** The engine configured, or none (extraction not offered: no setting, or Claude's not written yet). */
export function extractionProvider(): Extractor | undefined {
  switch (process.env.AI_PROVIDER) {
    case "azure": {
      const options = azureOptionsFromEnv();
      return options ? readingText(azureScopeReader(options)) : undefined;
    }
    case "fake":
      return testExtractor;
    default:
      return undefined;
  }
}

export const extractionOff = () =>
  Response.json({ error: "L’extraction automatique n’est pas encore configurée : ajoutez les éléments à la main en attendant.", code: "EXTRACTION_OFF" }, { status: 503 });

/** The items proposed, bounded; an error when the engine failed (said to the agency, detailed in the log). */
export async function extractScope(provider: Extractor, input: ExtractionInput): Promise<{ items: ExtractedItem[] } | { error: string }> {
  try {
    return { items: readExtracted(await provider(input)) };
  } catch (error) {
    if (error instanceof ExtractionRefusal) return { error: error.message };
    console.error("[scope extraction]", error instanceof Error ? error.message : error);
    return { error: "L’extraction a échoué. Réessayez, ou ajoutez les éléments à la main." };
  }
}
