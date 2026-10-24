// The words of a PDF, read on the server for the scope extraction (src/lib/scopeExtractor.ts): the model
// gets the text, never the file, whatever its provider. With pdf.js, already in Kora for the canvas (no
// scripting: this version evaluates no code of the file), and only a PDF the agency imported itself is read
// (readOwnPdf).
// A scanned PDF has no words: an empty text, which the extraction says.

export const pdfTextLimits = { pages: 100 };

/** The text of the first pages, page after page, up to `maxLength` characters. */
export async function pdfText(bytes: Uint8Array, maxLength: number) {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loading = getDocument({ data: new Uint8Array(bytes), useSystemFonts: false, verbosity: 0 });
  try {
    const document = await loading.promise;
    let text = "";
    for (let number = 1; number <= Math.min(document.numPages, pdfTextLimits.pages) && text.length < maxLength; number++) {
      const content = await (await document.getPage(number)).getTextContent();
      text += content.items.map((item) => ("str" in item ? item.str + (item.hasEOL ? "\n" : " ") : "")).join("") + "\n\n";
    }
    return text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, maxLength);
  } finally {
    await loading.destroy();
  }
}
