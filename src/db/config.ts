// Which database the app talks to. Shared by the app (server side) and drizzle.config.ts.
//
//   DATABASE_TARGET=local    -> DATABASE_URL_LOCAL  (Postgres in Docker, see docker-compose.yml)
//   DATABASE_TARGET=remote   -> DATABASE_URL_REMOTE (Supabase today, Azure PostgreSQL later)
//
// For a remote server the connection is encrypted. Set DATABASE_SSL_CA to the provider's CA
// certificate to also verify the server: a file path (local), or the PEM text itself (hosts such as
// Vercel, where no file is deployed). Without it the certificate is not checked.

import { readFileSync } from "node:fs";

export type DatabaseTarget = "local" | "remote";

export function databaseConfig() {
  const target = (process.env.DATABASE_TARGET ?? "local") as DatabaseTarget;
  if (target !== "local" && target !== "remote")
    throw new Error(`DATABASE_TARGET must be "local" or "remote", not "${target}".`);

  const variable = target === "local" ? "DATABASE_URL_LOCAL" : "DATABASE_URL_REMOTE";
  const url = process.env[variable];
  if (!url) throw new Error(`DATABASE_TARGET is "${target}" but ${variable} is not set (see .env.example).`);

  const ca = process.env.DATABASE_SSL_CA;
  const ssl =
    target === "local"
      ? false
      : ca
        ? { ca: ca.includes("-----BEGIN") ? ca.replace(/\\n/g, "\n") : readFileSync(ca, "utf8"), rejectUnauthorized: true }
        : { rejectUnauthorized: false };

  return { target, url, ssl };
}
