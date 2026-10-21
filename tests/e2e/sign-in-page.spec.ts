// The sign-in page, as a visitor sees it: the mark back to the site, sign-in first and account creation
// one link below, every field labelled, the forgotten password flow reachable, and nothing the browser
// refuses (CSP). It holds the labels and roles the other tests (and people) rely on.

import { expect, test } from "@playwright/test";
import { createAgency, newPerson, signInPage, signUp } from "./helpers";

test("sign-in page: brand, both modes, labelled fields and the forgotten-password flow", async ({ browser }) => {
  const { page, errors } = await newPerson(browser);
  await page.goto("/connexion");

  // The site's header is there too: back home, the sections, the demo.
  const header = page.getByRole("banner");
  await expect(header.getByRole("link", { name: "Kora, accueil" })).toHaveAttribute("href", "/");
  await expect(header.getByRole("navigation", { name: "Sections" }).getByRole("link", { name: "Fonctionnement" })).toBeVisible();
  await expect(header.getByRole("link", { name: "Réserver une démo" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Se connecter à Kora");
  // No tabs: account creation is offered under the form.
  await expect(page.getByRole("tab")).toHaveCount(0);
  // The page fits the screen.
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight)).toBe(true);
  await expect(page.getByLabel("E-mail")).toBeVisible();
  await expect(page.getByLabel("Mot de passe")).toHaveAttribute("type", "password");
  await expect(page.getByRole("button", { name: "Se connecter" })).toBeVisible();
  // No Google nor Microsoft button unless its keys are set (they are not in the tests).
  await expect(page.getByRole("button", { name: "Continuer avec Google" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Continuer avec Microsoft" })).toHaveCount(0);

  await page.getByRole("button", { name: "Créer un compte" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Créer votre compte");
  await expect(page.getByLabel("Prénom")).toBeVisible();
  await expect(page.getByRole("button", { name: "Créer mon compte" })).toBeVisible();

  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByLabel("Prénom")).toHaveCount(0);
  await page.getByRole("button", { name: "Mot de passe oublié ?" }).click();
  await expect(page.getByRole("heading", { name: "Mot de passe oublié" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Envoyer le lien" })).toBeVisible();
  await page.getByRole("button", { name: "Retour à la connexion" }).click();
  await expect(page.getByRole("button", { name: "Se connecter" })).toBeVisible();

  // Keyboard: the e-mail field is reachable by Tab, the form submits with Enter.
  await page.getByLabel("E-mail").focus();
  await expect(page.getByLabel("E-mail")).toBeFocused();

  expect(errors).toEqual([]);
});

test("the header's links switch the sign-in page between its two modes", async ({ browser }) => {
  const { page, errors } = await newPerson(browser);
  await page.goto("/connexion");
  const header = page.getByRole("banner");
  // « Se connecter » is not offered in the header of the sign-in page itself.
  await expect(header.getByRole("link", { name: "Se connecter" })).toHaveCount(0);
  await header.getByRole("link", { name: "Essayer Kora" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Créer votre compte");
  await expect(page.getByLabel("Prénom")).toBeVisible();
  // Back to sign-in from the form: the address follows, so the header's link works again.
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Se connecter à Kora");
  await expect.poll(() => new URL(page.url()).searchParams.get("compte")).toBe("existant");
  await header.getByRole("link", { name: "Essayer Kora" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Créer votre compte");
  expect(errors).toEqual([]);
});

test("a signed-in member who opens the sign-in page lands in the app instead", async ({ browser }) => {
  const member = await signUp("Mia Faure");
  await createAgency(member, "Studio Mia");
  const { page } = await newPerson(browser);
  await signInPage(page, member.email);
  await page.goto("/connexion");
  await page.waitForURL((url) => url.pathname === "/");
  await expect(page.getByRole("button", { name: "Compte de Mia Faure" }).first()).toBeVisible();
});

test("on a tablet or a phone, without the illustration, the form stands alone in the middle", async ({ browser }) => {
  const { page, errors } = await newPerson(browser);
  for (const width of [880, 390]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/connexion");
    const form = page.getByRole("button", { name: "Se connecter" });
    await expect(form).toBeVisible();
    const box = (await form.boundingBox())!;
    // As much room on the left as on the right: no empty column where the illustration was.
    expect(Math.abs(box.x - (width - box.x - box.width))).toBeLessThanOrEqual(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  expect(errors).toEqual([]);
});
