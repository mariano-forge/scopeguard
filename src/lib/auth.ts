// Agency sign-in: e-mail + password and Google, with Better Auth. Accounts and sessions live in
// Postgres (src/db/auth-schema.ts). Clients never sign in: they use their review link.
//
// Security choices:
// - passwords hashed with scrypt, at least 10 characters; sessions in httpOnly cookies (Secure in production);
// - a Google sign-in is never linked to an existing password account automatically: e-mail addresses are
//   not verified at sign-up (no e-mail provider yet), so someone could have registered with another
//   person's address before them;
// - sign-in, sign-up and reset attempts are limited per IP, counted in the database (shared by all instances);
// - mails (reset links, invitations) go through src/lib/mail.ts: printed in the console in development,
//   never logged elsewhere (a reset link is a credential).
//
// Agencies (organization plugin): whoever creates an agency is its owner and invites colleagues by
// e-mail; an invitation can only be accepted by an account with the invited address. Every agency
// record is filtered on the member's agency (src/lib/session.ts, src/db/state.ts).

import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { organization } from "better-auth/plugins";
import { getDb } from "@/db/client";
import { accounts, invitations, members, organizations, rateLimits, sessions, users, verifications } from "@/db/auth-schema";
import { appUrl, sendMail } from "./mail";

export const googleSignInEnabled = () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

function createAuth() {
  if (!process.env.BETTER_AUTH_SECRET) throw new Error("BETTER_AUTH_SECRET is not set (see .env.example).");

  return betterAuth({
    appName: "Kora",
    baseURL: process.env.BETTER_AUTH_URL,
    secret: process.env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(getDb(), {
      provider: "pg",
      schema: {
        user: users,
        session: sessions,
        account: accounts,
        verification: verifications,
        rateLimit: rateLimits,
        organization: organizations,
        member: members,
        invitation: invitations,
      },
    }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 10,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        await sendMail({
          to: user.email,
          subject: "Réinitialiser votre mot de passe Kora",
          text: `Pour choisir un nouveau mot de passe, ouvrez ce lien (valable une heure) :\n${url}\n\nSi vous n'avez rien demandé, ignorez cet e-mail.`,
        });
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
    plugins: [
      organization({
        creatorRole: "owner",
        // One agency created per account; joining others by invitation stays possible.
        organizationLimit: 1,
        invitationExpiresIn: 60 * 60 * 24 * 7,
        cancelPendingInvitationsOnReInvite: true,
        sendInvitationEmail: async ({ id, email, organization: agency, inviter }) => {
          await sendMail({
            to: email,
            subject: `${inviter.user.name} vous invite à rejoindre ${agency.name} sur Kora`,
            text: `${inviter.user.name} vous invite à rejoindre l'agence ${agency.name} sur Kora.\n\nRejoindre l'agence : ${appUrl()}/invitation/${id}\n\nConnectez-vous ou créez votre compte avec cette adresse (${email}). L'invitation est valable 7 jours.`,
          });
        },
      }),
      nextCookies(),
    ],
  });
}

// Created on first use, so building the app does not need the database variables.
const globalForAuth = globalThis as unknown as { koraAuth?: ReturnType<typeof createAuth> };

export function getAuth() {
  globalForAuth.koraAuth ??= createAuth();
  return globalForAuth.koraAuth;
}
