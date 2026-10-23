// Secrets Kora keeps for an agency (its Figma tokens, src/db/figmaConnection.ts), sealed with AES-256-GCM
// under TOKEN_ENCRYPTION_KEY: a copy of the database alone opens nothing, and a sealed value altered in
// the database is refused instead of being used. A key of its own, not BETTER_AUTH_SECRET: renewing the
// sign-in secret must not cut every agency's connections.

import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const version = "v1";

function key() {
  const value = process.env.TOKEN_ENCRYPTION_KEY;
  const bytes = value ? Buffer.from(value, "base64") : Buffer.alloc(0);
  if (bytes.length !== 32) throw new Error("TOKEN_ENCRYPTION_KEY must be 32 bytes in base64 (openssl rand -base64 32).");
  return bytes;
}

/** Whether secrets can be sealed on this server. */
export const canSeal = () => {
  try {
    return Boolean(key());
  } catch {
    return false;
  }
};

export function seal(secret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const sealed = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return [version, iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), sealed.toString("base64url")].join(".");
}

/** The secret, or null when the value was not sealed with this key or was altered. */
export function unseal(value: string): string | null {
  const [given, iv, tag, sealed] = value.split(".");
  if (given !== version || !iv || !tag || !sealed) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(sealed, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
