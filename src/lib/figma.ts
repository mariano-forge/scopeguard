// Figma's web API, as Kora uses it (US-054): connecting an agency's account by OAuth, then reading the
// comments of its files and answering them. A plugin cannot touch Figma's comments; only this API can.
// FIGMA_API_URL and FIGMA_OAUTH_URL point the tests at a stand-in (tests/e2e/figmaStandIn.ts): they never
// reach Figma.

import "server-only";
import { appUrl } from "./mail";
import { canSeal } from "./sealed";

const apiUrl = () => (process.env.FIGMA_API_URL || "https://api.figma.com").replace(/\/$/, "");
const oauthUrl = () => process.env.FIGMA_OAUTH_URL || "https://www.figma.com/oauth";

/**
 * Everything the next steps need, asked at once: Figma makes every agency connect again when an app
 * asks for a new scope later.
 */
export const figmaScopes = ["current_user:read", "file_content:read", "file_comments:read", "file_comments:write", "file_versions:read", "webhooks:read", "webhooks:write"];

/** Whether this server can connect agencies to Figma: its app and a key to seal the tokens. */
export const figmaAvailable = () => Boolean(process.env.FIGMA_CLIENT_ID && process.env.FIGMA_CLIENT_SECRET && canSeal());

export const figmaRedirectUri = () => `${appUrl()}/api/integrations/figma/callback`;

/** Figma's consent page, for this agency's attempt (`state`) and its PKCE challenge. */
export function figmaAuthorizeUrl(state: string, codeChallenge: string) {
  const url = new URL(oauthUrl());
  url.search = new URLSearchParams({
    client_id: process.env.FIGMA_CLIENT_ID ?? "",
    redirect_uri: figmaRedirectUri(),
    scope: figmaScopes.join(" "),
    state,
    response_type: "code",
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  }).toString();
  return url.toString();
}

export type FigmaTokens = { accessToken: string; refreshToken: string; expiresAt: Date; figmaUserId: string };
export type FigmaUser = { id: string; handle: string };

const basicAuth = () => `Basic ${Buffer.from(`${process.env.FIGMA_CLIENT_ID}:${process.env.FIGMA_CLIENT_SECRET}`).toString("base64")}`;

async function figmaJson(path: string, init: RequestInit): Promise<Record<string, unknown> | null> {
  const response = await fetch(apiUrl() + path, { ...init, signal: AbortSignal.timeout(10_000), cache: "no-store" }).catch(() => null);
  if (!response?.ok) return null;
  const body = (await response.json().catch(() => null)) as unknown;
  return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
}

const text = (value: unknown) => (typeof value === "string" && value ? value : null);

/** The tokens for the code Figma sent back (valid 30 seconds), or null when Figma refuses it. */
export async function exchangeFigmaCode(code: string, codeVerifier: string): Promise<FigmaTokens | null> {
  const body = await figmaJson("/v1/oauth/token", {
    method: "POST",
    headers: { authorization: basicAuth(), "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ redirect_uri: figmaRedirectUri(), code, grant_type: "authorization_code", code_verifier: codeVerifier }),
  });
  const accessToken = text(body?.access_token);
  const refreshToken = text(body?.refresh_token);
  const figmaUserId = text(body?.user_id_string) ?? (typeof body?.user_id === "number" ? String(body.user_id) : null);
  const expiresIn = Number(body?.expires_in);
  if (!accessToken || !refreshToken || !figmaUserId || !Number.isFinite(expiresIn) || expiresIn <= 0) return null;
  return { accessToken, refreshToken, figmaUserId, expiresAt: new Date(Date.now() + expiresIn * 1000) };
}

/** Who the token belongs to, or null. */
export async function figmaMe(accessToken: string): Promise<FigmaUser | null> {
  const body = await figmaJson("/v1/me", { headers: { authorization: `Bearer ${accessToken}` } });
  const id = text(body?.id);
  const handle = text(body?.handle);
  return id && handle ? { id, handle: handle.slice(0, 100) } : null;
}
