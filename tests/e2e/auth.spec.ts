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
  expect((await call("/api/spaces", { method: "POST", person: forged, body: { name: "Forgé" } })).status).toBe(401);
  // The state is read only: no generic write, whoever asks.
  expect((await call("/api/state", { method: "PATCH", person: forged, body: { changes: {} } })).status).toBe(405);
});

test("sign-up leads to creating one's agency, then to its empty home", async ({ browser }) => {
  const { page, errors } = await newPerson(browser);
  const email = `${unique("nouveau")}@agence.test`;
  await page.goto("/projets/1");
  await page.getByRole("button", { name: "Créer un compte" }).click();
  await page.getByLabel("Prénom").fill("Nina");
  await page.getByLabel("Nom", { exact: true }).fill("Roux");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Mot de passe").fill("court");
  await page.getByRole("button", { name: "Créer mon compte" }).click();
  // Too short: blocked by the form itself.
  expect(await page.getByLabel("Mot de passe").evaluate((input: HTMLInputElement) => input.validity.valid)).toBe(false);
  await page.getByLabel("Mot de passe").fill(PASSWORD);
  // The confirmation must match.
  await page.getByLabel("Confirmation").fill("Autre-mot-de-passe-9");
  await page.getByRole("button", { name: "Créer mon compte" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "ne correspondent pas" })).toBeVisible();
  await page.getByLabel("Confirmation").fill(PASSWORD);
  // The screen comes once the server has created the account (hashing the password takes a while).
  await Promise.all([page.waitForResponse((answer) => answer.url().includes("/api/auth/sign-up/email")), page.getByRole("button", { name: "Créer mon compte" }).click()]);
  // No session before the address is confirmed: the link in the mail opens it.
  // A screen of its own: the address, and « Renvoyer l'e-mail » after a short wait.
  await expect(page.getByRole("heading", { name: "Vérifiez vos e-mails" })).toBeVisible();
  await expect(page.getByRole("status")).toContainText(`lien de confirmation à ${email}`);
  await expect(page.getByRole("button", { name: /Renvoyer l’e-mail dans/ })).toBeDisabled();
  expect((await page.context().cookies()).some((cookie) => cookie.name.includes("session_token"))).toBe(false);
  await page.goto(linkIn(await waitForMail(email, "Confirmez votre adresse"))!);

  await expect(page.getByLabel("Nom de votre organisation")).toBeVisible();
  await page.getByLabel("Nom de votre organisation").fill("Studio Nina");
  await page.getByRole("button", { name: "Créer mon organisation" }).click();
  // Then its first steps (tests/e2e/onboarding.spec.ts), each one skippable.
  await page.waitForURL((url) => url.pathname === "/demarrer");
  await page.getByRole("button", { name: "Passer" }).click();
  await expect(page.getByRole("heading", { name: "Invitez vos collègues" })).toBeVisible();
  await page.getByRole("button", { name: "Terminer" }).click();
  await page.waitForURL((url) => url.pathname === "/");
  await expect(page.getByRole("button", { name: "Compte de Nina Roux" }).first()).toBeVisible();

  // Stored hashed, never in clear.
  const [account] = await sql<{ password: string }>("select a.password from accounts a join users u on u.id = a.user_id where u.email = $1", [email]);
  expect(account.password).not.toContain(PASSWORD);
  expect(errors).toEqual([]);
});

test("the confirmation screen sends the link again after a wait, and lets one fix the address", async ({ browser }) => {
  const { page, errors } = await newPerson(browser);
  // The page clock, so the 30 s wait before « Renvoyer l’e-mail » passes at once.
  await page.clock.install();
  const email = `${unique("renvoi")}@agence.test`;
  await page.goto("/connexion?compte=nouveau");
  await page.getByLabel("Prénom").fill("Hugo");
  await page.getByLabel("Nom", { exact: true }).fill("Petit");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Mot de passe").fill(PASSWORD);
  await page.getByLabel("Confirmation").fill(PASSWORD);
  await Promise.all([page.waitForResponse((answer) => answer.url().includes("/api/auth/sign-up/email")), page.getByRole("button", { name: "Créer mon compte" }).click()]);
  await expect(page.getByRole("heading", { name: "Vérifiez vos e-mails" })).toBeVisible();
  await waitForMail(email, "Confirmez votre adresse");
  const resend = page.getByRole("button", { name: /Renvoyer l’e-mail/ });
  await expect(resend).toBeDisabled();

  await page.clock.runFor(30_000);
  await expect(resend).toHaveText("Renvoyer l’e-mail");
  await resend.click();
  await expect(page.getByText("E-mail renvoyé.")).toBeVisible();
  await expect.poll(() => mailsTo(email).filter((mail) => mail.subject.includes("Confirmez votre adresse")).length).toBe(2);
  // Pressed again at once: the wait starts over.
  await expect(resend).toBeDisabled();

  // A wrong address: back to the form, to sign up again.
  await page.getByRole("button", { name: "Modifier l’adresse" }).click();
  await expect(page.getByRole("button", { name: "Créer mon compte" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("a weak password is refused by the server, whatever the page: no account is created", async () => {
  const name = "Lucie Bernard";
  for (const password of ["tout-en-minuscules-sans-chiffre", "Court-1!", "Motdepasse-2024!", "Lucie-Bernard-2026"]) {
    const email = `${unique("faible")}@agence.test`;
    const response = await fetch(`${baseUrl()}/api/auth/sign-up/email`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: baseUrl(), "x-forwarded-for": newIp() },
      body: JSON.stringify({ name, email, password }),
    });
    expect(response.status, password).toBe(400);
    expect(((await response.json()) as { code?: string }).code, password).toMatch(/PASSWORD_TOO_(WEAK|SHORT)/);
    expect(await sql("select 1 from users where email = $1", [email])).toHaveLength(0);
  }
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
  await page.getByLabel("Nouveau mot de passe").fill("Nouveau-mot-de-passe-7");
  await page.getByLabel("Confirmation").fill("Nouveau-mot-de-passe-7");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByRole("heading", { name: "Mot de passe modifié" })).toBeVisible();

  await page.goto(link!);
  await expect(page.getByRole("heading", { name: "Lien expiré" })).toBeVisible();

  const { page: fresh } = await newPerson(browser);
  await fresh.goto("/connexion?suite=//evil.example");
  await fresh.getByLabel("E-mail").fill(member.email);
  await fresh.getByLabel("Mot de passe").fill("Nouveau-mot-de-passe-7");
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
