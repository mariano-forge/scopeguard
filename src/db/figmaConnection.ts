// An agency's Figma connection (US-054): stored sealed, read back by the server only. What a page sees of
// it is figmaConnectionStatus: the Figma account's name and who connected it, never a token.

import "server-only";
import { eq } from "drizzle-orm";
import { readFigmaPages, readFigmaVersions, refreshFigmaToken, type FigmaFileTree, type FigmaRefusal, type FigmaTokens, type FigmaUser } from "@/lib/figma";
import type { FigmaVersion } from "@/lib/figmaLink";
import { seal, unseal } from "@/lib/sealed";
import type { Db } from "./client";
import { users } from "./auth-schema";
import { figmaConnections } from "./schema";

export type FigmaConnectionStatus = { handle: string; connectedBy: string; connectedAt: string } | null;

export async function figmaConnectionStatus(db: Db, organizationId: string): Promise<FigmaConnectionStatus> {
  const [row] = await db
    .select({ handle: figmaConnections.handle, connectedAt: figmaConnections.connectedAt, name: users.name })
    .from(figmaConnections)
    .leftJoin(users, eq(users.id, figmaConnections.connectedBy))
    .where(eq(figmaConnections.organizationId, organizationId))
    .limit(1);
  return row ? { handle: row.handle, connectedBy: row.name ?? "Un ancien membre", connectedAt: row.connectedAt.toISOString() } : null;
}

/** Stores the agency's connection, replacing the one it had (another Figma account, or the same one again). */
export async function saveFigmaConnection(db: Db, organizationId: string, memberId: string, tokens: FigmaTokens, user: FigmaUser) {
  const row = {
    figmaUserId: user.id,
    handle: user.handle,
    accessToken: seal(tokens.accessToken),
    refreshToken: seal(tokens.refreshToken),
    expiresAt: tokens.expiresAt,
    connectedBy: memberId,
    connectedAt: new Date(),
  };
  await db
    .insert(figmaConnections)
    .values({ organizationId, ...row })
    .onConflictDoUpdate({ target: figmaConnections.organizationId, set: row });
}

/** Forgets the agency's tokens. Figma has no way to revoke them: the account's owner removes Kora in Figma. */
export async function deleteFigmaConnection(db: Db, organizationId: string) {
  await db.delete(figmaConnections).where(eq(figmaConnections.organizationId, organizationId));
}

/** Renewed this long before it expires: a token never runs out between a read and the next. */
const renewAheadMs = 24 * 60 * 60 * 1000;

/**
 * The agency's Figma access token, renewed when it is about to expire; null when the agency has no
 * connection, or one Figma no longer honours (it then connects again).
 */
export async function figmaAccessToken(db: Db, organizationId: string): Promise<string | null> {
  const [row] = await db.select().from(figmaConnections).where(eq(figmaConnections.organizationId, organizationId)).limit(1);
  if (!row) return null;
  const current = unseal(row.accessToken);
  if (current && row.expiresAt.getTime() - Date.now() > renewAheadMs) return current;
  const refreshToken = unseal(row.refreshToken);
  const renewed = refreshToken ? await refreshFigmaToken(refreshToken) : null;
  if (!renewed) return null;
  await db
    .update(figmaConnections)
    .set({ accessToken: seal(renewed.accessToken), expiresAt: renewed.expiresAt })
    .where(eq(figmaConnections.organizationId, organizationId));
  return renewed.accessToken;
}

export type FigmaRefused = { ok: false; status: number; error: string; code: string };

export const notConnected: FigmaRefused = {
  ok: false,
  status: 409,
  code: "FIGMA_NOT_CONNECTED",
  error: "Figma n’est pas connecté à l’agence : le propriétaire ou un administrateur le connecte dans « Paramètres de l’agence ».",
};

const until = (date: Date) => date.toLocaleString("fr-FR", { day: "numeric", month: "long", hour: "numeric", minute: "2-digit", timeZone: "Europe/Paris" });

/** What the agency is told when Figma refuses (never a 403: the page would take it for a lost session). */
export function figmaRefused(refusal: FigmaRefusal): FigmaRefused {
  if ("missing" in refusal)
    return { ok: false, status: 404, code: "FIGMA_FILE_MISSING", error: "Ce fichier n’est pas accessible au compte Figma connecté. Vérifiez le lien, ou partagez le fichier avec ce compte." };
  if ("limitedUntil" in refusal)
    return {
      ok: false,
      status: 429,
      code: "FIGMA_RATE_LIMITED",
      error: `Figma limite les lectures de fichiers du compte connecté jusqu’au ${until(refusal.limitedUntil)}. Un compte Figma avec une place d’éditeur (Full ou Dev) n’a presque pas cette limite.`,
    };
  return { ok: false, status: 502, code: "FIGMA_UNAVAILABLE", error: "Figma ne répond pas pour l’instant. Réessayez dans un moment." };
}

export const isRefusal = (value: object): value is FigmaRefusal => "missing" in value || "limitedUntil" in value || "unavailable" in value;

/** The file's name and pages (Figma's tightest read: once per deliverable), with its saved versions. */
export async function loadFigmaFile(db: Db, organizationId: string, fileKey: string): Promise<{ ok: true; tree: FigmaFileTree; versions: FigmaVersion[] } | FigmaRefused> {
  const token = await figmaAccessToken(db, organizationId);
  if (!token) return notConnected;
  const [tree, versions] = await Promise.all([readFigmaPages(token, fileKey), readFigmaVersions(token, fileKey)]);
  if (isRefusal(tree)) return figmaRefused(tree);
  if (!Array.isArray(versions)) return figmaRefused(versions);
  return { ok: true, tree, versions };
}

/** The file's saved versions only: what « Relire le fichier » and a new round read. */
export async function loadFigmaVersions(db: Db, organizationId: string, fileKey: string): Promise<{ ok: true; versions: FigmaVersion[] } | FigmaRefused> {
  const token = await figmaAccessToken(db, organizationId);
  if (!token) return notConnected;
  const versions = await readFigmaVersions(token, fileKey);
  return Array.isArray(versions) ? { ok: true, versions } : figmaRefused(versions);
}

/** The Figma account the agency connected: its comments are the agency's, never imported as the client's. */
export async function figmaConnectedUser(db: Db, organizationId: string) {
  const [row] = await db.select({ id: figmaConnections.figmaUserId }).from(figmaConnections).where(eq(figmaConnections.organizationId, organizationId)).limit(1);
  return row?.id ?? null;
}
