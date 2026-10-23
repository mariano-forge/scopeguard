// Figma's web API, as Kora uses it (US-054): connecting an agency's account by OAuth, then reading the
// comments of its files and answering them. A plugin cannot touch Figma's comments; only this API can.
// FIGMA_API_URL and FIGMA_OAUTH_URL point the tests at a stand-in (tests/e2e/figmaStandIn.ts): they never
// reach Figma.

import "server-only";
import { appUrl } from "./mail";
import { canSeal } from "./sealed";
import type { FigmaPage, FigmaVersion } from "./figmaLink";

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

type Answer = { status: number; body: Record<string, unknown> | null };

/** Figma's answer: its status (0 when unreachable) and its body when it is an object. */
async function figmaAnswer(path: string, init: RequestInit = {}): Promise<Answer> {
  const response = await fetch(apiUrl() + path, { ...init, signal: AbortSignal.timeout(10_000), cache: "no-store" }).catch(() => null);
  if (!response) return { status: 0, body: null };
  const body = (await response.json().catch(() => null)) as unknown;
  return { status: response.status, body: body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null };
}

async function figmaJson(path: string, init: RequestInit = {}) {
  const answer = await figmaAnswer(path, init);
  return answer.status >= 200 && answer.status < 300 ? answer.body : null;
}

const bearer = (accessToken: string) => ({ authorization: `Bearer ${accessToken}` });

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
  const body = await figmaJson("/v1/me", { headers: bearer(accessToken) });
  const id = text(body?.id);
  const handle = text(body?.handle);
  return id && handle ? { id, handle: handle.slice(0, 100) } : null;
}

/** A new access token for the refresh token (Figma keeps the same refresh token), or null when Figma refuses it. */
export async function refreshFigmaToken(refreshToken: string): Promise<{ accessToken: string; expiresAt: Date } | null> {
  const body = await figmaJson("/v1/oauth/refresh", {
    method: "POST",
    headers: { authorization: basicAuth(), "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ refresh_token: refreshToken }),
  });
  const accessToken = text(body?.access_token);
  const expiresIn = Number(body?.expires_in);
  return accessToken && Number.isFinite(expiresIn) && expiresIn > 0 ? { accessToken, expiresAt: new Date(Date.now() + expiresIn * 1000) } : null;
}

const list = (value: unknown) => (Array.isArray(value) ? (value as Record<string, unknown>[]).filter((item) => item && typeof item === "object") : []);

/**
 * Why Figma did not give what was asked: the file is not open to the connected account, Figma limits
 * this account's reads until `until` (a View or Collab seat may read a file only 20 times a month), or
 * Figma did not answer.
 */
export type FigmaRefusal = { missing: true } | { limitedUntil: Date } | { unavailable: true };

function refusalOf(answer: Answer, retryAfter: string | null): FigmaRefusal | null {
  if (answer.status === 403 || answer.status === 404) return { missing: true };
  if (answer.status === 429) return { limitedUntil: new Date(Date.now() + Math.max(60, Number(retryAfter) || 60) * 1000) };
  return answer.status >= 200 && answer.status < 300 && answer.body ? null : { unavailable: true };
}

async function figmaRead(path: string, accessToken: string) {
  const response = await fetch(apiUrl() + path, { headers: bearer(accessToken), signal: AbortSignal.timeout(10_000), cache: "no-store" }).catch(() => null);
  if (!response) return { answer: { status: 0, body: null }, refusal: { unavailable: true } as FigmaRefusal };
  const body = (await response.json().catch(() => null)) as unknown;
  const answer: Answer = { status: response.status, body: body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null };
  return { answer, refusal: refusalOf(answer, response.headers.get("retry-after")) };
}

export type FigmaFileTree = { name: string; pages: FigmaPage[] };

/**
 * The file's name and pages. Figma counts this read in its tightest tier (20 a month for a View or
 * Collab seat): Kora reads it once per deliverable, never on each change of a dialog.
 */
export async function readFigmaPages(accessToken: string, key: string): Promise<FigmaFileTree | FigmaRefusal> {
  const { answer, refusal } = await figmaRead(`/v1/files/${encodeURIComponent(key)}?depth=1`, accessToken);
  if (refusal) return refusal;
  const name = text(answer.body?.name);
  const document = answer.body?.document as Record<string, unknown> | undefined;
  if (!name || !document) return { unavailable: true };
  const pages = list(document.children)
    .filter((page) => page.type === "CANVAS" && text(page.id) && typeof page.name === "string")
    .slice(0, 100)
    .map((page) => ({ id: String(page.id), name: String(page.name).slice(0, 200) }));
  return { name: name.slice(0, 200), pages };
}

/**
 * The versions saved in the file's history, latest first: only the named ones (Figma also keeps unnamed
 * autosaves, which no one sends to a client). A read Figma allows far more often than the file's.
 */
export async function readFigmaVersions(accessToken: string, key: string): Promise<FigmaVersion[] | FigmaRefusal> {
  const { answer, refusal } = await figmaRead(`/v1/files/${encodeURIComponent(key)}/versions`, accessToken);
  if (refusal) return refusal;
  return list(answer.body?.versions)
    .filter((version) => text(version.id) && text(version.label))
    .map((version) => ({
      id: String(version.id),
      label: String(version.label).slice(0, 200),
      createdAt: text(version.created_at) ?? "",
      author: text((version.user as Record<string, unknown> | undefined)?.handle) ?? "",
    }));
}
