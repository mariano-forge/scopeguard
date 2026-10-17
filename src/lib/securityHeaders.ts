// Security headers of every page (next.config.ts), and of Kora's panel on the agency's staging site,
// the one page another site may frame (src/proxy.ts, src/lib/siteReview.ts).

// Where the browser loads imported files from: the storage accounts (Azure, Azurite in development),
// reached through /api/files redirects (src/lib/storage.ts). *.blob.core.windows.net also covers
// agencies moved to an account of their own.
const storageOrigins = () =>
  [process.env.STORAGE_URL_LOCAL, process.env.STORAGE_URL_REMOTE, "https://*.blob.core.windows.net"]
    .filter((url): url is string => Boolean(url))
    .map((url) => (url.includes("*") ? url : new URL(url).origin))
    .join(" ");

const production = () => process.env.NODE_ENV === "production";
const https = () => (process.env.BETTER_AUTH_URL ?? "").startsWith("https://");

/**
 * Content Security Policy. Scripts and styles allow 'unsafe-inline': Next.js writes inline scripts
 * without nonces here (a nonce policy would make every page dynamic); the policy still blocks
 * scripts from elsewhere, plugins, framing by other sites, and data sent anywhere but here and the
 * file storage. `frameAncestors`: who may show the page in a frame, nobody but for the site panel.
 */
export function contentSecurityPolicy(frameAncestors = "'none'") {
  const storage = storageOrigins();
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${storage}`,
    `media-src 'self' blob: ${storage}`,
    "font-src 'self' data:",
    `connect-src 'self' ${storage}`,
    // pdf.js runs in a worker; a just-imported PDF is previewed in a frame from a blob: address.
    "worker-src 'self' blob:",
    "frame-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    `frame-ancestors ${frameAncestors}`,
    ...(https() ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

/**
 * The panel's policy, set by src/proxy.ts: framed by `parent` only. Development keeps no other policy
 * (hot reload uses eval and websockets), but the framing rule holds there too.
 */
export const siteFramePolicy = (parent: string | null) =>
  production() ? contentSecurityPolicy(parent ?? "'none'") : `frame-ancestors ${parent ?? "'none'"}`;

/** Headers of every response but the site panel's, which differs by its framing rule. */
export function securityHeaders({ framed = false } = {}) {
  return [
    ...(production() && !framed ? [{ key: "Content-Security-Policy", value: contentSecurityPolicy() }] : []),
    // No page of Kora may be shown in another site's frame (a hidden "Valider cette version" click);
    // the site panel says by its policy which one site may.
    ...(framed ? [] : [{ key: "X-Frame-Options", value: "DENY" }]),
    { key: "X-Content-Type-Options", value: "nosniff" },
    // Review links carry their token in the address: other sites only ever see the origin.
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()" },
    ...(production() && https() ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }] : []),
  ];
}

/** The site panel's addresses: /review/<token>/site, and /review/site/<key> that leads to it (src/lib/siteKey.ts). */
export const siteFramePath = /^\/review\/([^/]+\/site|site\/[^/]+)$/;
