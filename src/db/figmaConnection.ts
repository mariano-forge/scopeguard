// An agency's Figma connection (US-054): stored sealed, read back by the server only. What a page sees of
// it is figmaConnectionStatus: the Figma account's name and who connected it, never a token.

import "server-only";
import { eq } from "drizzle-orm";
import type { FigmaTokens, FigmaUser } from "@/lib/figma";
import { seal } from "@/lib/sealed";
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
