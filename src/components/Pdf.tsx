"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";

/**
 * Files are served by a redirect to a short-lived storage address (src/lib/storage.ts): after it, the
 * storage's range headers are not readable by the page, so pdf.js loads each file whole instead of
 * by ranges. One object, so react-pdf never sees new options and reloads.
 */
const options = { disableRange: true, disableStream: true };

/** react-pdf, loaded on the client only, with the pdf.js worker served from pdfjs-dist. */
export const PdfDocument = dynamic(
  async () => {
    const pdf = await import("react-pdf");
    // Legacy build: polyfills the very recent JavaScript the modern worker needs (older Safari, Firefox ESR).
    pdf.pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();
    const Document = (props: ComponentProps<typeof pdf.Document>) => <pdf.Document options={options} {...props} />;
    return Document;
  },
  { ssr: false },
);

export const PdfPage = dynamic(() => import("react-pdf").then((pdf) => pdf.Page), { ssr: false });
