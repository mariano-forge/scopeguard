// The deliverable page's guided tour (src/app/(agency)/DeliverableTour.tsx): one feature at a time,
// « Passer » or « Continuer », seen once per browser. No banner about sharing over the canvas any more.

import { expect, test, type Browser } from "@playwright/test";
import { createAgency, newIp, seedState, signInPage, signUp } from "./helpers";

async function firstVisit(browser: Browser) {
  const alice = await signUp("Alice Martin");
  await createAgency(alice, "Studio Tour");
  await seedState(alice, {
    lists: {
      clients: { upsert: [{ id: 1, name: "Northwind" }], remove: [] },
      projects: { upsert: [{ id: 1, name: "Refonte", clientId: 1, client: "Northwind", status: "En cours" }], remove: [] },
      deliverables: { upsert: [{ id: 1, projectId: 1, name: "maquette.pdf", type: "PDF", version: 1, status: "Brouillon", locked: false, importedAt: "14/10/2026" }], remove: [] },
    },
  });
  // A browser that has never seen the tour (newPerson marks it seen for the other tests).
  const context = await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": newIp() }, viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await signInPage(page, alice.email);
  await page.goto("/projets/1/livrables/1");
  return { page, errors };
}

const bubble = (page: import("@playwright/test").Page, title: string) => page.getByRole("dialog", { name: `Découvrir le livrable : ${title}` });

test("the tour shows each feature in turn, and « Passer » ends it for good", async ({ browser }) => {
  const { page, errors } = await firstVisit(browser);
  await expect(bubble(page, "Commentez sur le livrable")).toContainText("1 sur 4");
  // The feature it speaks of is ringed.
  await expect(page.locator('.tool-button[aria-label="Commentaire"]')).toHaveAttribute("data-tour-target", "");
  // Sharing is no longer announced by a banner over the canvas.
  await expect(page.getByText("n’est partagée avec personne")).toHaveCount(0);

  await bubble(page, "Commentez sur le livrable").getByRole("button", { name: "Continuer" }).click();
  await expect(bubble(page, "Qualifiez chaque demande")).toContainText("2 sur 4");
  await expect(page.locator(".inspector-tabs")).toHaveAttribute("data-tour-target", "");
  await expect(page.locator('.tool-button[aria-label="Commentaire"]')).not.toHaveAttribute("data-tour-target", "");

  await bubble(page, "Qualifiez chaque demande").getByRole("button", { name: "Passer" }).click();
  await expect(page.getByRole("dialog", { name: /Découvrir le livrable/ })).toHaveCount(0);
  await expect(page.locator("[data-tour-target]")).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("button", { name: "Partager la revue" })).toBeVisible();
  await expect(page.getByRole("dialog", { name: /Découvrir le livrable/ })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("« Continuer » goes through the five features and « Terminer » closes the tour", async ({ browser }) => {
  const { page, errors } = await firstVisit(browser);
  const titles = ["Commentez sur le livrable", "Qualifiez chaque demande", "Une nouvelle version ?", "Partagez avec votre client"];
  for (const [at, title] of titles.entries()) {
    await expect(bubble(page, title)).toContainText(`${at + 1} sur 4`);
    await bubble(page, title).getByRole("button", { name: at === titles.length - 1 ? "Terminer" : "Continuer" }).click();
  }
  await expect(page.getByRole("dialog", { name: /Découvrir le livrable/ })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("button", { name: "Partager la revue" })).toBeVisible();
  await expect(page.getByRole("dialog", { name: /Découvrir le livrable/ })).toHaveCount(0);
  expect(errors).toEqual([]);
});
