// The members' Figma connections (US-054): one per member and agency, stored sealed, read back by the server
// only. A member reads Figma files with their own account; a « Figma » deliverable's comments are read with
// the account of who made it, or of a colleague who takes it over. What a page sees is figmaConnectionStatus:
// the member's Figma account name, never a token.

import "server-only";
import { and, eq, ne, sql } from "drizzle-orm";
import { readFigmaPages, readFigmaVersions, refreshFigmaToken, type FigmaFileTree, type FigmaRefusal, type FigmaTokens, type FigmaUser } from "@/lib/figma";
import type { FigmaVersion } from "@/lib/figmaLink";
import { seal, unseal } from "@/lib/sealed";
import type { Db } from "./client";
import { figmaConnections, settings } from "./schema";

export type FigmaConnectionStatus = { handle: string; connectedAt: string } | null;

const mine = (organizationId: string, userId: string) => and(eq(figmaConnections.organizationId, organizationId), eq(figmaConnections.userId, userId));

/** The member's own connection, as the page shows it. */
export async function figmaConnectionStatus(db: Db, organizationId: string, userId: string): Promise<FigmaConnectionStatus> {
  const [row] = await db.select({ handle: figmaConnections.handle, connectedAt: figmaConnections.connectedAt }).from(figmaConnections).where(mine(organizationId, userId)).limit(1);
  return row ? { handle: row.handle, connectedAt: row.connectedAt.toISOString() } : null;
}

/**
 * Stores the member's connection, replacing the one they had. Figma keeps one live token per Figma account
 * and app: a colleague of the agency connected with the same Figma account loses theirs, which no longer
 * works anyway. The account joins the agency's team in Figma (figmaTeam, src/db/figmaImport.ts) and stays
 * there once disconnected: its comments remain the agency's, until the agency unticks it.
 */
export async function saveFigmaConnection(db: Db, organizationId: string, userId: string, tokens: FigmaTokens, user: FigmaUser) {
  const row = {
    figmaUserId: user.id,
    handle: user.handle,
    accessToken: seal(tokens.accessToken),
    refreshToken: seal(tokens.refreshToken),
    expiresAt: tokens.expiresAt,
    connectedAt: new Date(),
  };
  await db
    .insert(figmaConnections)
    .values({ organizationId, userId, ...row })
    .onConflictDoUpdate({ target: [figmaConnections.organizationId, figmaConnections.userId], set: row });
  await db
    .delete(figmaConnections)
    .where(and(eq(figmaConnections.organizationId, organizationId), eq(figmaConnections.figmaUserId, user.id), ne(figmaConnections.userId, userId)));
  // Merged in one statement, like the agency's other settings written apart (src/db/siteSeen.ts).
  await db.execute(sql`
    insert into ${settings} (organization_id, key, value)
    values (${organizationId}, 'figmaTeam', jsonb_build_object(${user.id}::text, ${user.handle}::text))
    on conflict (organization_id, key) do update set value = coalesce(${settings.value}, '{}'::jsonb) || excluded.value`);
}

/** Forgets the member's tokens. Figma has no way to revoke them: the account's owner removes Kora in Figma. */
export async function deleteFigmaConnection(db: Db, organizationId: string, userId: string) {
  await db.delete(figmaConnections).where(mine(organizationId, userId));
}

/** Renewed this long before it expires: a token never runs out between a read and the next. */
const renewAheadMs = 24 * 60 * 60 * 1000;

/**
 * The member's Figma access token, renewed when it is about to expire; null when they have no connection,
 * or one Figma no longer honours (they then connect again).
 */
export async function figmaAccessToken(db: Db, organizationId: string, userId: string): Promise<string | null> {
  const [row] = await db.select().from(figmaConnections).where(mine(organizationId, userId)).limit(1);
  if (!row) return null;
  const current = unseal(row.accessToken);
  if (current && row.expiresAt.getTime() - Date.now() > renewAheadMs) return current;
  const refreshToken = unseal(row.refreshToken);
  const renewed = refreshToken ? await refreshFigmaToken(refreshToken) : null;
  if (!renewed) return null;
  await db
    .update(figmaConnections)
    .set({ accessToken: seal(renewed.accessToken), expiresAt: renewed.expiresAt })
    .where(mine(organizationId, userId));
  return renewed.accessToken;
}

export type FigmaRefused = { ok: false; status: number; error: string; code: string };

export const notConnected: FigmaRefused = {
  ok: false,
  status: 409,
  code: "FIGMA_NOT_CONNECTED",
  error: "Votre compte Figma n’est pas connecté à Kora : connectez-le depuis le menu de votre compte, « Compte Figma ».",
};

const until = (date: Date) => date.toLocaleString("fr-FR", { day: "numeric", month: "long", hour: "numeric", minute: "2-digit", timeZone: "Europe/Paris" });

/** What the agency is told when Figma refuses (never a 403: the page would take it for a lost session). */
export function figmaRefused(refusal: FigmaRefusal): FigmaRefused {
  if ("missing" in refusal)
    return { ok: false, status: 404, code: "FIGMA_FILE_MISSING", error: "Ce fichier n’est pas accessible à votre compte Figma. Vérifiez le lien, ou demandez qu’il soit partagé avec votre compte." };
  if ("limitedUntil" in refusal)
    return {
      ok: false,
      status: 429,
      code: "FIGMA_RATE_LIMITED",
      error: `Figma limite les lectures de fichiers de votre compte jusqu’au ${until(refusal.limitedUntil)}. Un compte Figma avec une place d’éditeur (Full ou Dev) n’a presque pas cette limite.`,
    };
  return { ok: false, status: 502, code: "FIGMA_UNAVAILABLE", error: "Figma ne répond pas pour l’instant. Réessayez dans un moment." };
}

export const isRefusal = (value: object): value is FigmaRefusal => "missing" in value || "limitedUntil" in value || "unavailable" in value;

/** The file's name and pages (Figma's tightest read: once per deliverable), with its saved versions. */
export async function loadFigmaFile(db: Db, organizationId: string, userId: string, fileKey: string): Promise<{ ok: true; tree: FigmaFileTree; versions: FigmaVersion[] } | FigmaRefused> {
  const token = await figmaAccessToken(db, organizationId, userId);
  if (!token) return notConnected;
  const [tree, versions] = await Promise.all([readFigmaPages(token, fileKey), readFigmaVersions(token, fileKey)]);
  if (isRefusal(tree)) return figmaRefused(tree);
  if (!Array.isArray(versions)) return figmaRefused(versions);
  return { ok: true, tree, versions };
}

/** The file's saved versions only: what « Relire le fichier » and a new round read. */
export async function loadFigmaVersions(db: Db, organizationId: string, userId: string, fileKey: string): Promise<{ ok: true; versions: FigmaVersion[] } | FigmaRefused> {
  const token = await figmaAccessToken(db, organizationId, userId);
  if (!token) return notConnected;
  const versions = await readFigmaVersions(token, fileKey);
  return Array.isArray(versions) ? { ok: true, versions } : figmaRefused(versions);
}

/** The Figma accounts the agency's members connected: their comments are the agency's, never the client's. */
export async function figmaAgencyAccounts(db: Db, organizationId: string) {
  return new Set((await db.select({ id: figmaConnections.figmaUserId }).from(figmaConnections).where(eq(figmaConnections.organizationId, organizationId))).map((row) => row.id));
}
