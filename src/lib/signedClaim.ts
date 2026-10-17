// Short claims signed by the server (HMAC with BETTER_AUTH_SECRET), not stored: the tickets and the
// sessions of Kora's panel on the staging site (src/lib/siteAgency.ts, src/lib/siteHandoff.ts).
// `scope` keeps one kind of claim from ever being read as another.

import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

function signature(scope: string, payload: string) {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error("BETTER_AUTH_SECRET is not set.");
  return createHmac("sha256", secret).update(`${scope}:${payload}`).digest("base64url");
}

/** `claim`, valid `lifetimeMs` from now, signed for `scope`. */
export function signClaim(scope: string, claim: Record<string, unknown>, lifetimeMs: number) {
  const payload = Buffer.from(JSON.stringify({ ...claim, expires: Date.now() + lifetimeMs })).toString("base64url");
  return `${payload}.${signature(scope, payload)}`;
}

/** The claim a value holds when it was signed for `scope` and is not expired; null otherwise. */
export function readClaim<T extends Record<string, unknown>>(scope: string, value: unknown): (T & { expires: number }) | null {
  if (typeof value !== "string" || value.length > 1000) return null;
  const [payload, given] = value.split(".");
  if (!payload || !given) return null;
  const expected = Buffer.from(signature(scope, payload));
  const received = Buffer.from(given);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;
  try {
    const claim = JSON.parse(Buffer.from(payload, "base64url").toString()) as T & { expires: number };
    return typeof claim.expires === "number" && claim.expires > Date.now() ? claim : null;
  } catch {
    return null;
  }
}

/**
 * A claim that does not expire (the staging site's key, src/lib/siteKey.ts), signed for `scope`.
 * Read only by readPermanent: a ticket's reader refuses it (no `expires`), and this one refuses tickets.
 */
export function signPermanent(scope: string, claim: Record<string, unknown>) {
  const payload = Buffer.from(JSON.stringify({ ...claim, permanent: true })).toString("base64url");
  // "~", not ".": a key goes in an address, and src/proxy.ts skips addresses ending like a file (".abc").
  return `${payload}~${signature(scope, payload)}`;
}

/** The claim a permanent value holds when it was signed for `scope`; null otherwise. */
export function readPermanent<T extends Record<string, unknown>>(scope: string, value: unknown): T | null {
  if (typeof value !== "string" || value.length > 1000) return null;
  const [payload, given] = value.split("~");
  if (!payload || !given) return null;
  const expected = Buffer.from(signature(scope, payload));
  const received = Buffer.from(given);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;
  try {
    const claim = JSON.parse(Buffer.from(payload, "base64url").toString()) as T & { permanent?: unknown };
    return claim.permanent === true ? claim : null;
  } catch {
    return null;
  }
}
