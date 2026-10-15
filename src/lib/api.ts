// Helpers shared by the API routes.

import type { StateChanges } from "./sharedState";

export function databaseFailure(scope: string, error: unknown) {
  console.error(`[${scope}]`, error);
  return Response.json({ error: "Base de données indisponible" }, { status: 503 });
}

/** Body of a PATCH: { changes }, or null when malformed. */
export async function readChanges(request: Request): Promise<StateChanges | null> {
  try {
    const body = (await request.json()) as { changes?: StateChanges };
    return body?.changes && typeof body.changes === "object" ? body.changes : null;
  } catch {
    return null;
  }
}

/**
 * Where a request comes from, for the audit trail: its IP address and browser.
 *
 * The IP is read from x-forwarded-for, where each proxy appends the address it received the request
 * from. A visitor can send their own header, so only what trusted proxies appended is reliable:
 * TRUSTED_PROXY_HOPS is how many sit in front of the app (1 behind Azure Front Door or Vercel). With
 * none declared (local), the address is kept but marked "non vérifiée": Next passes a header sent by
 * the visitor through unchanged.
 */
export function requestOrigin(request: Request) {
  const hops = Math.max(0, Math.floor(Number(process.env.TRUSTED_PROXY_HOPS ?? 0)) || 0);
  const chain = (request.headers.get("x-forwarded-for") ?? "").split(",").map((entry) => entry.trim()).filter(Boolean);
  const address = hops > 0 ? chain[chain.length - hops] : chain.at(-1);
  return {
    ipAddress: address ? (hops > 0 ? address : `${address} (non vérifiée)`).slice(0, 100) : null,
    userAgent: request.headers.get("user-agent")?.slice(0, 300) ?? null,
  };
}

const writeMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * A write sent from another site's page (cross-site request forgery): browsers name the page's origin
 * in `Origin` on every write. Session cookies are SameSite=Lax already; this refuses them by origin too.
 * Requests without a browser origin (scripts, tests) are let through: they carry no visitor's cookie.
 */
export function crossSiteWrite(request: Request) {
  if (!writeMethods.has(request.method)) return false;
  const origin = request.headers.get("origin");
  if (!origin) return request.headers.get("sec-fetch-site") === "cross-site";
  const allowed = [new URL(request.url).origin];
  if (process.env.BETTER_AUTH_URL) allowed.push(new URL(process.env.BETTER_AUTH_URL).origin);
  return !allowed.includes(origin);
}

export const crossSiteRefusal = () => Response.json({ error: "Requête refusée : origine inconnue" }, { status: 403 });
