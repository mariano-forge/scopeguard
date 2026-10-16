import type { NextConfig } from "next";

// Where the browser loads imported files from: the storage accounts (Azure, Azurite in development),
// reached through /api/files redirects (src/lib/storage.ts). *.blob.core.windows.net also covers
// agencies moved to an account of their own.
const storageOrigins = [process.env.STORAGE_URL_LOCAL, process.env.STORAGE_URL_REMOTE, "https://*.blob.core.windows.net"]
  .filter((url): url is string => Boolean(url))
  .map((url) => (url.includes("*") ? url : new URL(url).origin))
  .join(" ");

const production = process.env.NODE_ENV === "production";
const https = (process.env.BETTER_AUTH_URL ?? "").startsWith("https://");

/**
 * Content Security Policy. Scripts and styles allow 'unsafe-inline': Next.js writes inline scripts
 * without nonces here (a nonce policy would make every page dynamic); the policy still blocks
 * scripts from elsewhere, plugins, framing by other sites, and data sent anywhere but here and the
 * file storage. Development keeps no policy (hot reload uses eval and websockets).
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${storageOrigins}`,
  `media-src 'self' blob: ${storageOrigins}`,
  "font-src 'self' data:",
  `connect-src 'self' ${storageOrigins}`,
  // pdf.js runs in a worker; a just-imported PDF is previewed in a frame from a blob: address.
  "worker-src 'self' blob:",
  "frame-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(https ? ["upgrade-insecure-requests"] : []),
].join("; ");

const securityHeaders = [
  ...(production ? [{ key: "Content-Security-Policy", value: contentSecurityPolicy }] : []),
  // No page of Kora may be shown in another site's frame (a hidden "Valider cette version" click).
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Review links carry their token in the address: other sites only ever see the origin.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()" },
  ...(production && https ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }] : []),
];

const nextConfig: NextConfig = {
  // Do not announce the framework.
  poweredByHeader: false,
  // Kora does not use next/image: no image optimisation endpoint (and its image library) to expose.
  images: { unoptimized: true },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
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
