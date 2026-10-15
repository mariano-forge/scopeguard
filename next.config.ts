import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The import limit, known to the pages too (the server checks it again in /api/files).
  env: { NEXT_PUBLIC_MAX_UPLOAD_MB: process.env.MAX_UPLOAD_MB ?? "50" },
  // pdf.js 6 relies on JavaScript only the latest browsers have (Map.getOrInsertComputed, Math.sumPrecise):
  // its legacy build carries polyfills, so a PDF also opens in an older Safari or a Firefox ESR.
  turbopack: {
    resolveAlias: {
      "pdfjs-dist": "pdfjs-dist/legacy/build/pdf.mjs",
      "pdfjs-dist/web/pdf_viewer.mjs": "pdfjs-dist/legacy/web/pdf_viewer.mjs",
    },
  },
};

export default nextConfig;
