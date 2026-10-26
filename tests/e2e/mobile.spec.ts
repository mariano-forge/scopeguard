// The agency's pages on a phone: a bar instead of the tabs, the sidebar as a drawer, the deliverable
// on the whole screen with its requests in a sheet at the bottom. On a computer, nothing of it shows.

import { expect, test, type Browser } from "@playwright/test";
import { createAgency, newPerson, seedState, signInPage, signUp } from "./helpers";

async function agency(browser: Browser) {
  const alice = await signUp("Alice Martin");
  await createAgency(alice, "Studio Mobile");
  await seedState(alice, {
    lists: {
      clients: { upsert: [{ id: 1, name: "Northwind" }], remove: [] },
      projects: { upsert: [{ id: 1, name: "Refonte", clientId: 1, client: "Northwind", status: "En cours" }], remove: [] },
      deliverables: { upsert: [{ id: 1, projectId: 1, name: "maquette.pdf", type: "PDF", version: 1, status: "Brouillon", locked: false, importedAt: "14/10/2026" }], remove: [] },
      comments: {
        upsert: [{ id: 30, deliverableId: 1, author: "Claire Dubois", initials: "CD", from: "client", message: "Le logo plus grand", decision: "À qualifier", kind: "remark", location: "Page 1", page: 1, position: { x: 30, y: 20 }, time: "t" }],
        remove: [],
      },
    },
  });
  const { page, errors } = await newPerson(browser);
  await signInPage(page, alice.email);
  return { page, errors };
}

test("on a phone, the menu opens the sidebar, leads to a space and closes on the way", async ({ browser }) => {
  const { page, errors } = await agency(browser);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  // No tabs: the bar names the page.
  await expect(page.locator(".tab-bar")).toBeHidden();
  const bar = page.locator(".mobile-bar");
  await expect(bar).toContainText("Vue d’ensemble");
  await expect(page.getByRole("complementary", { name: "Navigation" })).toBeHidden();

  await bar.getByRole("button", { name: "Ouvrir le menu" }).click();
  await expect(bar.getByRole("button", { name: "Fermer le menu" })).toHaveAttribute("aria-expanded", "true");
  await page.getByRole("complementary", { name: "Navigation" }).getByRole("link", { name: "Northwind" }).click();
  await page.waitForURL(/\/espaces\/1$/);
  await expect(bar).toContainText("Northwind");
  await expect(bar.getByRole("button", { name: "Ouvrir le menu" })).toBeVisible();
  // The Kora mark goes back home.
  await bar.getByRole("link", { name: "Accueil" }).click();
  await page.waitForURL((url) => url.pathname === "/");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test("on a phone, the deliverable fills the screen and its requests open from a sheet at the bottom", async ({ browser }) => {
  const { page, errors } = await agency(browser);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/projets/1/livrables/1");
  await expect(page.locator(".mobile-bar")).toContainText("maquette.pdf");

  const handle = page.getByRole("button", { name: /le panneau des demandes \(1\)$/ });
  await expect(handle).toHaveAttribute("aria-expanded", "false");
  // Closed, the sheet leaves the deliverable and its tools in view.
  const sheet = (await page.locator(".editor-inspector").boundingBox())!;
  const tools = (await page.getByRole("toolbar", { name: "Outils du canevas" }).boundingBox())!;
  expect(tools.y + tools.height).toBeLessThanOrEqual(844 - 56);
  expect(sheet.y).toBeGreaterThan(844 - 60);

  await handle.click();
  await expect(handle).toHaveAttribute("aria-expanded", "true");
  // The request's card, in the sheet (its pin's hover preview holds the same words).
  await expect(page.locator(".editor-inspector").getByText("Le logo plus grand")).toBeInViewport();
  await expect(page.getByRole("button", { name: "Partager la revue" })).toBeInViewport();
  await handle.click();
  await expect(handle).toHaveAttribute("aria-expanded", "false");
  expect(errors).toEqual([]);
});

test("on a computer, the tabs stay and nothing of the phone layout shows", async ({ browser }) => {
  const { page, errors } = await agency(browser);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/projets/1/livrables/1");
  await expect(page.locator(".tab-bar")).toBeVisible();
  await expect(page.locator(".mobile-bar")).toBeHidden();
  await expect(page.getByRole("button", { name: /le panneau des demandes/ })).toBeHidden();
  // The requests panel stays on the right, beside the deliverable.
  const panel = (await page.locator(".editor-inspector").boundingBox())!;
  expect(panel.x).toBeGreaterThan(800);
  expect(panel.height).toBeGreaterThan(600);
  expect(errors).toEqual([]);
});
