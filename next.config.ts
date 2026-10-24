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
      { source: "/:path((?!review/[^/]+/site$|review/site/[^/]+$).*)", headers: securityHeaders() },
      { source: "/review/:token/site", headers: securityHeaders({ framed: true }) },
      { source: "/review/site/:key", headers: securityHeaders({ framed: true }) },
    ];
  },
  // The storage SDK is loaded by Node, once: bundled, a reload of the dev server could evaluate a second
  // copy of @azure/storage-common, whose key class the first copy's SAS signing no longer recognises
  // (« Invalid sharedKeyCredential »: every file answered 503, src/lib/storage.ts). pdf.js too, on the server
  // (src/lib/pdfText.ts): loaded by Node, it finds its worker file next to it, a file it imports by a name
  // the build cannot see, so the extraction's route is given it.
  serverExternalPackages: ["@azure/storage-blob", "@azure/storage-common", "pdfjs-dist"],
  outputFileTracingIncludes: { "/api/projects/\\[projectId\\]/scope/extraction": ["./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"] },
  // The import limits, known to the pages too (the server checks them again in /api/files); whether « Nouveau
  // livrable » offers Figma comments (FIGMA_COMMENTS, src/lib/figmaLink.ts).
  env: {
    NEXT_PUBLIC_MAX_UPLOAD_MB: process.env.MAX_UPLOAD_MB ?? "50",
    NEXT_PUBLIC_MAX_VIDEO_UPLOAD_MB: process.env.MAX_VIDEO_UPLOAD_MB ?? "1024",
    NEXT_PUBLIC_FIGMA_COMMENTS: process.env.FIGMA_COMMENTS ?? "",
  },
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
