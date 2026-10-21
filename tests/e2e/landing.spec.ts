// The public front door: the landing page at "/" for visitors (the address unchanged), the app for
// members; the demo request page (/demo), mailed to the team and limited like every public route that writes.

import { expect, test } from "@playwright/test";
import { baseURL } from "../../playwright.config";
import { createAgency, mailsTo, newIp, newPerson, signInPage, signUp, unique, waitForMail } from "./helpers";

/** DEMO_REQUESTS_TO in playwright.config.ts. */
const demoInbox = "demo@kora.test";

test("a visitor sees the landing page at /, a member sees the app", async ({ browser }) => {
  const { page, errors } = await newPerson(browser);
  await page.goto("/");
  expect(new URL(page.url()).pathname).toBe("/");
  await expect(page.getByRole("heading", { level: 1, name: "Gardez le scope de vos projets sous contrôle." })).toBeVisible();
  const sections = page.getByRole("navigation", { name: "Sections" });
  for (const name of ["Fonctionnement", "Pourquoi Kora", "Pour vos clients", "Questions"]) await expect(sections.getByRole("link", { name })).toBeVisible();
  await expect(page.getByRole("banner").getByRole("link", { name: "Essayer Kora" })).toBeVisible();
  // The demo is offered at the top (the header) and in the footer; the page itself leads to account creation.
  await expect(page.getByRole("banner").getByRole("link", { name: "Réserver une démo" })).toBeVisible();
  await expect(page.getByRole("main").getByRole("link", { name: "Réserver une démo" })).toHaveCount(0);
  await expect(page.getByRole("form", { name: "Créer un compte" })).toHaveCount(2);

  // The main flow in four scenes, all visible at once; they can be paused, and played again.
  const moves = page.getByRole("list", { name: "Kora en quatre gestes" });
  await expect(moves.getByRole("listitem")).toHaveCount(4);
  await moves.scrollIntoViewIfNeeded();
  for (const name of ["Partager", "Commenter", "Chiffrer", "Valider"]) await expect(moves.getByRole("heading", { level: 3, name })).toBeInViewport();
  await expect(page.locator(".lp-film")).toHaveAttribute("data-playing", "");
  await page.getByRole("button", { name: "Mettre les animations en pause" }).click();
  await expect(page.locator(".lp-film")).not.toHaveAttribute("data-playing");
  await page.getByRole("button", { name: "Lire les animations" }).click();
  await expect(page.locator(".lp-film")).toHaveAttribute("data-playing", "");
  // The FAQ: one answer open at a time.
  const faq = page.getByRole("button", { name: /Combien coûte Kora/ });
  await faq.click();
  await expect(faq).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByText("agences pilotes")).toBeVisible();
  // Nothing the browser refuses (the production policy applies to this page too), nothing that throws.
  expect(errors).toEqual([]);

  await page.getByRole("banner").getByRole("link", { name: "Se connecter" }).click();
  await page.waitForURL((url) => url.pathname === "/connexion");
  await expect(page.getByRole("heading", { name: "Se connecter à Kora" })).toBeVisible();

  const member = await signUp("Leo Brun");
  await createAgency(member, "Studio Leo");
  const { page: app } = await newPerson(browser);
  await signInPage(app, member.email);
  await app.goto("/");
  await expect(app.getByRole("button", { name: "Compte de Leo Brun" }).first()).toBeVisible();
  await expect(app.getByRole("heading", { level: 1, name: /sous contrôle/ })).toHaveCount(0);
});

test("a demo request reaches the team's inbox, with the person as reply-to", async ({ browser }) => {
  const { page, errors } = await newPerson(browser);
  await page.goto("/");
  await page.getByRole("banner").getByRole("link", { name: "Réserver une démo" }).click();
  await page.waitForURL((url) => url.pathname === "/demo");
  const form = page.getByRole("form", { name: "Réserver une démo" });
  const email = `${unique("prospect")}@agence.test`;
  await form.getByLabel("Nom").fill("Sam Lopez");
  await form.getByLabel("E-mail").fill(email);
  await form.getByLabel("Agence").fill("Studio Sam");
  await form.getByLabel("Message").fill("Nous perdons des heures sur les retours PDF.");
  await form.getByRole("button", { name: "Envoyer la demande" }).click();
  await expect(page.getByRole("status")).toContainText("C’est noté.");
  await expect(page.getByRole("status")).toContainText(email);

  const mail = await waitForMail(demoInbox, "Demande de démo : Sam Lopez (Studio Sam)");
  expect(mail.text).toContain(email);
  expect(mail.text).toContain("retours PDF");
  expect(mail.replyTo).toBe(email);
  expect(errors).toEqual([]);
});

test("“Commencer” with a work e-mail opens account creation with the address filled in", async ({ browser }) => {
  const { page, errors } = await newPerson(browser);
  await page.goto("/");
  const email = `${unique("agence")}@studio.test`;
  const start = page.getByRole("form", { name: "Créer un compte" }).first();
  // Empty, then not an address: our message, in French, and the page stays.
  // (Next.js keeps its own empty role="alert" for route announcements: the message is picked by its text.)
  const message = page.getByRole("alert").filter({ hasText: /e-mail/ });
  await start.getByRole("button", { name: "Commencer" }).click();
  await expect(message).toHaveText("Indiquez votre e-mail professionnel.");
  await start.getByLabel("E-mail professionnel").fill("pas-une-adresse");
  await start.getByRole("button", { name: "Commencer" }).click();
  await expect(message).toHaveText("Cette adresse e-mail n’est pas valide.");
  expect(new URL(page.url()).pathname).toBe("/");
  await start.getByLabel("E-mail professionnel").fill(email);
  await start.getByRole("button", { name: "Commencer" }).click();
  // The onboarding page, the address already there.
  await page.waitForURL((url) => url.pathname === "/commencer" && url.searchParams.get("email") === email);
  await expect(page.getByRole("heading", { name: "Créer votre compte" })).toBeVisible();
  await expect(page.getByLabel("E-mail")).toHaveValue(email);
  await expect(page.getByLabel("Prénom")).toBeVisible();
  // Something that is not an address is not filled in.
  await page.goto("/commencer?email=pas-une-adresse");
  await expect(page.getByLabel("E-mail")).toHaveValue("");

  // The header's « Essayer gratuitement » leads to the same page.
  await page.goto("/");
  await page.getByRole("banner").getByRole("link", { name: "Essayer Kora" }).click();
  await page.waitForURL((url) => url.pathname === "/commencer");
  await expect(page.getByRole("button", { name: "Créer mon compte" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("demo requests: checked, limited per address, refused from other sites, bots swallowed", async () => {
  const ip = newIp();
  const post = (body: unknown, extra: Record<string, string> = {}) =>
    fetch(`${baseURL}/api/demo`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: baseURL, "x-forwarded-for": ip, ...extra },
      body: JSON.stringify(body),
    });
  expect((await post({ name: "", email: "x@y.test" })).status).toBe(400);
  expect((await post({ name: "Bot", email: "pas-une-adresse" })).status).toBe(400);
  // The honeypot: told "ok", no mail, not counted.
  const before = mailsTo(demoInbox).length;
  expect((await post({ name: "Bot", email: `${unique("bot")}@spam.test`, website: "http://spam.example" })).status).toBe(200);
  expect(mailsTo(demoInbox).length).toBe(before);
  // From another site's page: refused before anything else.
  expect((await post({ name: "Eve", email: "eve@evil.test" }, { origin: "https://evil.example" })).status).toBe(403);
  // Five per hour per address (DEMO_REQUESTS_PER_HOUR in playwright.config.ts), then 429.
  const statuses: number[] = [];
  for (let i = 0; i < 6; i++) statuses.push((await post({ name: `Prospect ${i}`, email: `${unique("pro")}@agence.test` })).status);
  expect(statuses).toEqual([200, 200, 200, 200, 200, 429]);
});
