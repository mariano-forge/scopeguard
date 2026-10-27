// One attempt to connect a member's Figma account (US-054). The attempt is bound three ways, so that a code
// Figma sends back is only ever stored for the member who started it:
// - `state`, signed by the server, names the member and the agency, for 10 minutes;
// - a cookie of this browser holds the same random value and the PKCE verifier: a link with someone
//   else's state, opened in another browser, is refused (login CSRF);
// - the callback checks again that the member is signed in and still in that agency.

import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { readClaim, signClaim } from "./signedClaim";

const scope = "figma-oauth";
const lifetimeMs = 10 * 60 * 1000;
export const figmaAttemptCookie = "kora_figma_attempt";
export const figmaAttemptPath = "/api/integrations/figma";

// `back`: the page of Kora the member left, signed with the attempt so that no one else's link chooses it.
type Claim = { userId: string; organizationId: string; nonce: string; back?: string | null };

const random = () => randomBytes(32).toString("base64url");

/** A new attempt: the `state` for Figma, the cookie for this browser, and the PKCE challenge. */
export function startFigmaAttempt(userId: string, organizationId: string, back: string | null = null) {
  const nonce = random();
  const verifier = random();
  return {
    state: signClaim(scope, { userId, organizationId, nonce, back }, lifetimeMs),
    cookie: `${nonce}.${verifier}`,
    codeChallenge: createHash("sha256").update(verifier).digest("base64url"),
    maxAge: lifetimeMs / 1000,
  };
}

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** The attempt the callback finishes, with its PKCE verifier; null when the state or the cookie do not match. */
export function finishFigmaAttempt(state: unknown, cookie: string | undefined): (Claim & { verifier: string }) | null {
  const claim = readClaim<Claim>(scope, state);
  const [nonce, verifier] = (cookie ?? "").split(".");
  if (!claim || !nonce || !verifier || typeof claim.nonce !== "string" || !same(claim.nonce, nonce)) return null;
  return { userId: claim.userId, organizationId: claim.organizationId, nonce: claim.nonce, back: typeof claim.back === "string" ? claim.back : null, verifier };
}
