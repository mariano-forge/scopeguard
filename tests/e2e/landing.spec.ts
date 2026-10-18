// The public front door: the landing page at "/" for visitors (the address unchanged), the app for
// members; the demo request, mailed to the team and limited like every public route that writes.

import { expect, test } from "@playwright/test";
import { baseURL } from "../../playwright.config";
import { createAgency, mailsTo, newIp, newPerson, signInPage, signUp, unique, waitForMail } from "./helpers";

/** DEMO_REQUESTS_TO in playwright.config.ts. */
const demoInbox = "demo@kora.test";

test("a visitor sees the landing page at /, a member sees the app", async ({ browser }) => {
  const { page, errors } = await newPerson(browser);
  await page.goto("/");
  expect(new URL(page.url()).pathname).toBe("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Chaque retour client devient une décision");
  const sections = page.getByRole("navigation", { name: "Sections" });
  for (const name of ["Comment ça marche", "Pourquoi Kora", "La preuve"]) await expect(sections.getByRole("link", { name })).toBeVisible();
  await expect(page.getByRole("button", { name: "Réserver une démo" }).first()).toBeVisible();
  // Nothing the browser refuses (the production policy applies to this page too), nothing that throws.
  expect(errors).toEqual([]);

  await page.getByRole("banner").getByRole("link", { name: "Se connecter" }).click();
  await page.waitForURL((url) => url.pathname === "/connexion");
  await expect(page.getByRole("heading", { name: "Bon retour." })).toBeVisible();

  const member = await signUp("Leo Brun");
  await createAgency(member, "Studio Leo");
  const { page: app } = await newPerson(browser);
  await signInPage(app, member.email);
  await app.goto("/");
  await expect(app.getByRole("button", { name: "Compte de Leo Brun" }).first()).toBeVisible();
  await expect(app.getByRole("heading", { level: 1 }).filter({ hasText: "Chaque retour client" })).toHaveCount(0);
});

test("a demo request reaches the team's inbox, with the person as reply-to", async ({ browser }) => {
  const { page, errors } = await newPerson(browser);
  await page.goto("/");
  await page.getByRole("button", { name: "Réserver une démo" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Réserver une démo" });
  const email = `${unique("prospect")}@agence.test`;
  await dialog.getByLabel("Nom").fill("Sam Lopez");
  await dialog.getByLabel("E-mail").fill(email);
  await dialog.getByLabel("Agence").fill("Studio Sam");
  await dialog.getByLabel("Message").fill("Nous perdons des heures sur les retours PDF.");
  await dialog.getByRole("button", { name: "Envoyer la demande" }).click();
  await expect(page.getByRole("dialog").getByRole("status")).toContainText("Merci");

  const mail = await waitForMail(demoInbox, "Demande de démo : Sam Lopez (Studio Sam)");
  expect(mail.text).toContain(email);
  expect(mail.text).toContain("retours PDF");
  expect(mail.replyTo).toBe(email);
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
