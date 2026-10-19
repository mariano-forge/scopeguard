// Agency sign-in: e-mail + password, Google and Microsoft (each when its keys are set), with Better Auth. Accounts and sessions live in
// Postgres (src/db/auth-schema.ts). Clients never sign in: they use their review link.
//
// Security choices:
// - passwords hashed with scrypt; a new password follows src/lib/passwordPolicy.ts (CNIL: 12 characters,
//   mixed, nothing common nor personal), checked here for sign-up and reset whatever the page;
//   sessions in httpOnly cookies (Secure in production);
// - an address is confirmed by a mailed link before its first session (Google addresses come verified);
// - a Google or Microsoft sign-in is never linked to an existing password account automatically: e-mail addresses are
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
import { APIError, createAuthMiddleware } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { organization } from "better-auth/plugins";
import { getDb } from "@/db/client";
import { accounts, invitations, members, organizations, rateLimits, sessions, users, verifications } from "@/db/auth-schema";
import { appUrl, sendMail } from "./mail";
import { renderMail } from "./mailTemplates";
import { maxPasswordLength, minPasswordLength, passwordProblem } from "./passwordPolicy";

export const googleSignInEnabled = () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
export const microsoftSignInEnabled = () => Boolean(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET);

/** The sign-in providers offered on the sign-in pages: only those whose keys are set. */
export const socialSignIns = () => [...(googleSignInEnabled() ? (["google"] as const) : []), ...(microsoftSignInEnabled() ? (["microsoft"] as const) : [])];

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
      // The address is confirmed by a link before any session: nobody works under someone else's address.
      requireEmailVerification: true,
      minPasswordLength,
      maxPasswordLength,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        await sendMail({
          to: user.email,
          subject: "Réinitialiser votre mot de passe Kora",
          ...renderMail({
            preheader: "Choisissez un nouveau mot de passe",
            heading: "Nouveau mot de passe",
            paragraphs: ["Pour choisir un nouveau mot de passe, ouvrez ce lien. Il est valable une heure et ne sert qu’une fois."],
            action: { label: "Choisir un mot de passe", href: url },
            footer: "Vous recevez cet e-mail parce qu’une réinitialisation a été demandée pour votre compte Kora. Si ce n’est pas vous, ignorez-le : votre mot de passe ne change pas.",
          }),
        });
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      // An unconfirmed sign-in is refused and gets the link again.
      sendOnSignIn: true,
      autoSignInAfterVerification: true,
      expiresIn: 60 * 60 * 24,
      sendVerificationEmail: async ({ user, url }) => {
        await sendMail({
          to: user.email,
          subject: "Confirmez votre adresse e-mail Kora",
          ...renderMail({
            preheader: "Un clic pour activer votre compte",
            heading: "Confirmez votre adresse",
            paragraphs: [`Bonjour ${user.name}, confirmez que cette adresse est bien la vôtre pour activer votre compte Kora. Le lien est valable 24 heures.`],
            action: { label: "Confirmer mon adresse", href: url },
            footer: "Vous recevez cet e-mail parce qu’un compte Kora a été créé avec cette adresse. Si ce n’est pas vous, ignorez-le : le compte ne sera pas activé.",
          }),
        });
      },
    },
    socialProviders: {
      ...(googleSignInEnabled()
        ? { google: { clientId: process.env.GOOGLE_CLIENT_ID!, clientSecret: process.env.GOOGLE_CLIENT_SECRET!, prompt: "select_account" as const } }
        : {}),
      // Work and personal Microsoft accounts ("common"), unless the app is limited to one tenant.
      ...(microsoftSignInEnabled()
        ? {
            microsoft: {
              clientId: process.env.MICROSOFT_CLIENT_ID!,
              clientSecret: process.env.MICROSOFT_CLIENT_SECRET!,
              tenantId: process.env.MICROSOFT_TENANT_ID || "common",
              prompt: "select_account" as const,
            },
          }
        : {}),
    },
    // A weak new password is refused before Better Auth stores it (sign-up, reset), with the reason.
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        const body = (ctx.body ?? {}) as Record<string, unknown>;
        const password = ctx.path === "/sign-up/email" ? body.password : ctx.path === "/reset-password" ? body.newPassword : undefined;
        if (typeof password !== "string") return;
        const problem = passwordProblem(password, { email: typeof body.email === "string" ? body.email : undefined, name: typeof body.name === "string" ? body.name : undefined });
        if (problem) throw new APIError("BAD_REQUEST", { message: problem, code: "PASSWORD_TOO_WEAK" });
      }),
    },
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
        // « Renvoyer l'e-mail » on the confirmation screen: a few times, not a mailing machine.
        "/send-verification-email": { window: 300, max: 3 },
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
            replyTo: inviter.user.email,
            ...renderMail({
              preheader: `Rejoignez l’équipe de ${agency.name}`,
              heading: `Rejoignez ${agency.name}`,
              paragraphs: [
                `${inviter.user.name} vous invite à rejoindre l’agence ${agency.name} sur Kora.`,
                `Connectez-vous ou créez votre compte avec cette adresse (${email}). L’invitation est valable 7 jours.`,
              ],
              action: { label: "Rejoindre l’agence", href: `${appUrl()}/invitation/${id}` },
              footer: `Vous recevez cet e-mail parce que ${inviter.user.name} vous a invité sur Kora. Répondez à cet e-mail pour lui écrire.`,
            }),
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
