import type { NextConfig } from "next";
import { securityHeaders } from "./src/lib/securityHeaders";

const nextConfig: NextConfig = {
  // Do not announce the framework.
  poweredByHeader: false,
  // Kora does not use next/image: no image optimisation endpoint (and its image library) to expose.
  images: { unoptimized: true },
  // Kora's panel on the agency's staging site may be framed by that site only: src/proxy.ts sets its policy.
  async headers() {
    return [
      { source: "/:path((?!review/[^/]+/site$).*)", headers: securityHeaders() },
      { source: "/review/:token/site", headers: securityHeaders({ framed: true }) },
    ];
  },
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
