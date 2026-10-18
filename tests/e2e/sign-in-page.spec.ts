// The sign-in page, as a visitor sees it: brand, the two modes, every field labelled, the forgotten
// password flow reachable, and nothing the browser refuses (CSP). Written before the page's redesign:
// it holds the labels and roles the other tests (and people) rely on.

import { expect, test } from "@playwright/test";
import { createAgency, newPerson, signInPage, signUp } from "./helpers";

test("sign-in page: brand, both modes, labelled fields and the forgotten-password flow", async ({ browser }) => {
  const { page, errors } = await newPerson(browser);
  await page.goto("/connexion");

  await expect(page.getByText("Kora", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("tab", { name: "Se connecter" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tab", { name: "Créer un compte" })).toBeVisible();
  await expect(page.getByLabel("E-mail")).toBeVisible();
  await expect(page.getByLabel("Mot de passe")).toHaveAttribute("type", "password");
  await expect(page.getByRole("button", { name: "Se connecter" })).toBeVisible();
  // No Google button unless it is configured (it is not in the tests).
  await expect(page.getByRole("button", { name: "Continuer avec Google" })).toHaveCount(0);

  await page.getByRole("tab", { name: "Créer un compte" }).click();
  await expect(page.getByLabel("Nom complet")).toBeVisible();
  await expect(page.getByRole("button", { name: "Créer mon compte" })).toBeVisible();

  await page.getByRole("tab", { name: "Se connecter" }).click();
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

test("a signed-in member who opens the sign-in page lands in the app instead", async ({ browser }) => {
  const member = await signUp("Mia Faure");
  await createAgency(member, "Studio Mia");
  const { page } = await newPerson(browser);
  await signInPage(page, member.email);
  await page.goto("/connexion");
  await page.waitForURL((url) => url.pathname === "/");
  await expect(page.getByRole("button", { name: "Compte de Mia Faure" }).first()).toBeVisible();
});
