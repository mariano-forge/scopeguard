// Agency sign-in: protected pages, sign-up into a new agency, errors that reveal nothing, password reset.

import { expect, test } from "@playwright/test";
import { baseURL } from "../../playwright.config";

const baseUrl = () => baseURL;
import { PASSWORD, call, linkIn, lastMailTo, mailsTo, newIp, newPerson, signUp, sql, unique, waitForMail } from "./helpers";

test("pages and data of the agency need a session; a forged cookie gets nothing", async () => {
  const page = await call("/projets/1");
  expect(page.status).toBe(307);
  expect(page.response.headers.get("location")).toContain("/connexion?suite=%2Fprojets%2F1");
  expect((await call("/api/state")).status).toBe(401);

  const forged = { cookie: "better-auth.session_token=forged.value" };
  expect((await call("/", { person: forged })).response.headers.get("location")).toContain("/connexion");
  expect((await call("/api/state", { person: forged })).status).toBe(401);
  expect((await call("/api/state", { method: "PATCH", person: forged, body: { changes: {} } })).status).toBe(401);
});

test("sign-up leads to creating one's agency, then to its empty home", async ({ browser }) => {
  const { page, errors } = await newPerson(browser);
  const email = `${unique("nouveau")}@agence.test`;
  await page.goto("/projets/1");
  await page.getByRole("tab", { name: "Créer un compte" }).click();
  await page.getByLabel("Nom complet").fill("Nina Roux");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Mot de passe").fill("court");
  await page.getByRole("button", { name: "Créer mon compte" }).click();
  // Too short: blocked by the form itself.
  expect(await page.getByLabel("Mot de passe").evaluate((input: HTMLInputElement) => input.validity.valid)).toBe(false);
  await page.getByLabel("Mot de passe").fill(PASSWORD);
  await page.getByRole("button", { name: "Créer mon compte" }).click();
  // No session before the address is confirmed: the link in the mail opens it.
  await expect(page.getByRole("status")).toContainText(`un lien de confirmation a été envoyé à ${email}`);
  expect((await page.context().cookies()).some((cookie) => cookie.name.includes("session_token"))).toBe(false);
  await page.goto(linkIn(await waitForMail(email, "Confirmez votre adresse"))!);

  await expect(page.getByLabel("Nom de votre agence")).toBeVisible();
  await page.getByLabel("Nom de votre agence").fill("Studio Nina");
  await page.getByRole("button", { name: "Créer mon agence" }).click();
  await page.waitForURL((url) => url.pathname === "/");
  await expect(page.getByRole("button", { name: "Compte de Nina Roux" }).first()).toBeVisible();

  // Stored hashed, never in clear.
  const [account] = await sql<{ password: string }>("select a.password from accounts a join users u on u.id = a.user_id where u.email = $1", [email]);
  expect(account.password).not.toContain(PASSWORD);
  expect(errors).toEqual([]);
});

test("a wrong password and an unknown address get the same answer", async ({ browser }) => {
  const member = await signUp("Paul Petit");
  const { page } = await newPerson(browser);
  await page.goto("/connexion");
  await page.getByLabel("E-mail").fill(member.email);
  await page.getByLabel("Mot de passe").fill("mauvais-mot-de-passe");
  // (Next adds its own role="alert" route announcer: the message is matched by its text.)
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "E-mail ou mot de passe" })).toHaveText("E-mail ou mot de passe incorrect.");
  await page.getByLabel("E-mail").fill(`${unique("inconnu")}@agence.test`);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "E-mail ou mot de passe" })).toHaveText("E-mail ou mot de passe incorrect.");
});

test("password reset: one-time link by mail, old link refused, new password works, no open redirect", async ({ browser }) => {
  const member = await signUp("Rita Blanc");
  const { page } = await newPerson(browser);
  await page.goto("/connexion");
  await page.getByRole("button", { name: "Mot de passe oublié ?" }).click();
  await page.getByLabel("E-mail").fill(member.email);
  await page.getByRole("button", { name: "Envoyer le lien" }).click();
  await expect(page.getByRole("status")).toContainText("Si un compte existe pour cet e-mail");

  const link = linkIn(lastMailTo(member.email));
  expect(link).toContain("/reset-password/");
  await page.goto(link!);
  await page.getByLabel("Nouveau mot de passe").fill("nouveau-mot-de-passe");
  await page.getByLabel("Confirmation").fill("nouveau-mot-de-passe");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByRole("heading", { name: "Mot de passe modifié" })).toBeVisible();

  await page.goto(link!);
  await expect(page.getByRole("heading", { name: "Lien expiré" })).toBeVisible();

  const { page: fresh } = await newPerson(browser);
  await fresh.goto("/connexion?suite=//evil.example");
  await fresh.getByLabel("E-mail").fill(member.email);
  await fresh.getByLabel("Mot de passe").fill("nouveau-mot-de-passe");
  await fresh.getByRole("button", { name: "Se connecter" }).click();
  await fresh.waitForURL((url) => !url.pathname.startsWith("/connexion"));
  expect(new URL(fresh.url()).host).toBe(new URL(page.url()).host);
});

test("an unconfirmed account cannot sign in and gets its link again; signing up twice reveals nothing", async ({ browser }) => {
  const email = `${unique("lent")}@agence.test`;
  const ip = newIp();
  const signUpAs = () =>
    fetch(`${baseUrl()}/api/auth/sign-up/email`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: baseUrl(), "x-forwarded-for": ip },
      body: JSON.stringify({ name: "Léa Lente", email, password: PASSWORD }),
    });
  const first = await signUpAs();
  expect(first.ok).toBe(true);
  expect(first.headers.getSetCookie().some((cookie) => cookie.includes("session_token"))).toBe(false);
  // The same address again: the same answer, and still no session.
  const second = await signUpAs();
  expect(second.status).toBe(first.status);
  expect(second.headers.getSetCookie().some((cookie) => cookie.includes("session_token"))).toBe(false);

  const before = mailsTo(email).length;
  const { page } = await newPerson(browser);
  await page.goto("/connexion");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Mot de passe").fill(PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Confirmez" })).toContainText("nous venons de vous renvoyer le lien");
  await expect.poll(() => mailsTo(email).length).toBeGreaterThan(before);
  expect(new URL(page.url()).pathname).toBe("/connexion");
});
