"use client";

import dynamic from "next/dynamic";

/** react-pdf, loaded on the client only, with the pdf.js worker served from pdfjs-dist. */
export const PdfDocument = dynamic(
  async () => {
    const pdf = await import("react-pdf");
    pdf.pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
    return pdf.Document;
  },
  { ssr: false },
);

export const PdfPage = dynamic(() => import("react-pdf").then((pdf) => pdf.Page), { ssr: false });
