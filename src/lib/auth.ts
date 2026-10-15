// Agency sign-in: e-mail + password and Google, with Better Auth. Accounts and sessions live in
// Postgres (src/db/auth-schema.ts). Clients never sign in: they use their review link.
//
// Security choices:
// - passwords hashed with scrypt, at least 10 characters; sessions in httpOnly cookies (Secure in production);
// - a Google sign-in is never linked to an existing password account automatically: e-mail addresses are
//   not verified at sign-up (no e-mail provider yet), so someone could have registered with another
//   person's address before them;
// - sign-in, sign-up and reset attempts are limited per IP, counted in the database (shared by all instances);
// - no e-mail provider yet: in development the reset link is printed in the server console; in production
//   it is not logged anywhere (it would be a credential in the logs), so reset waits for an e-mail provider.

import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { getDb } from "@/db/client";
import { accounts, rateLimits, sessions, users, verifications } from "@/db/auth-schema";

export const googleSignInEnabled = () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

function createAuth() {
  if (!process.env.BETTER_AUTH_SECRET) throw new Error("BETTER_AUTH_SECRET is not set (see .env.example).");

  return betterAuth({
    appName: "Kora",
    baseURL: process.env.BETTER_AUTH_URL,
    secret: process.env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(getDb(), {
      provider: "pg",
      schema: { user: users, session: sessions, account: accounts, verification: verifications, rateLimit: rateLimits },
    }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 10,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        if (process.env.NODE_ENV === "development") console.info(`\n[auth] Lien de réinitialisation pour ${user.email} :\n${url}\n`);
        else console.warn("[auth] Réinitialisation demandée, mais aucun service d'e-mail n'est configuré.");
      },
    },
    socialProviders: googleSignInEnabled()
      ? {
          google: {
            clientId: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
            prompt: "select_account",
          },
        }
      : {},
    account: { accountLinking: { disableImplicitLinking: true } },
    session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },
    rateLimit: {
      enabled: true,
      storage: "database",
      customRules: {
        "/sign-in/email": { window: 60, max: 5 },
        "/sign-up/email": { window: 60, max: 5 },
        "/request-password-reset": { window: 300, max: 3 },
        "/reset-password": { window: 300, max: 5 },
      },
    },
    plugins: [nextCookies()],
  });
}

// Created on first use, so building the app does not need the database variables.
const globalForAuth = globalThis as unknown as { koraAuth?: ReturnType<typeof createAuth> };

export function getAuth() {
  globalForAuth.koraAuth ??= createAuth();
  return globalForAuth.koraAuth;
}
