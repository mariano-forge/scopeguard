// Installing Kora's toolbar on a « Lien »'s staging site, from the first step of its board: the line for
// the site's tool, and Kora telling, live, when the toolbar was seen on the site (src/db/siteSeen.ts).
// The staging site is served by the test itself, on another origin (as in site-toolbar.spec.ts).

import { expect, test, type Browser } from "@playwright/test";
import { baseURL } from "../../playwright.config";
import { call, createAgency, newPerson, seedState, signInPage, signUp, sql, unique, verifiedClient, type Member } from "./helpers";

const site = "https://recette.boreal.test";

/** An agency with a « Lien » on `site`, shared, and its fixed key. */
async function linkDeliverable() {
  const alice = await signUp("Alice Martin");
  await createAgency(alice, "Studio Installation");
  const token = unique("tok-install");
  await seedState(alice, {
    lists: {
      clients: { upsert: [{ id: 1, name: "Café Boréal" }], remove: [] },
      projects: { upsert: [{ id: 1, name: "Refonte", clientId: 1, client: "Café Boréal", status: "En cours" }], remove: [] },
      deliverables: { upsert: [{ id: 1, projectId: 1, name: "Site de recette", type: "Link", url: `${site}/`, version: 1, status: "En attente client", importedAt: "22/10/2026 10:00", locked: false }], remove: [] },
    },
    maps: { reviewLinks: { upsert: { "1:1": { token, active: true, expiresAt: "01/01/2099", autoExpire: true, deliverableId: 1, version: 1 } }, remove: [] } },
  });
  const key = (await call("/api/deliverables/1/site-key", { person: alice })).json.key as string;
  return { alice, token, key };
}

/** The staging site's page with the line, opened by a visitor (local network allowed: Kora runs on this computer). */
async function openSite(browser: Browser, key: string) {
  const visitor = await newPerson(browser);
  await visitor.page.context().grantPermissions(["local-network-access"]);
  await visitor.page.context().route(`${site}/**`, (route) =>
    route.fulfill({ contentType: "text/html; charset=utf-8", body: `<!doctype html><html lang="fr"><body><h1>Café Boréal</h1><script src="${baseURL}/kora-toolbar.js" data-site="${key}" defer></script></body></html>` }),
  );
  await visitor.page.goto(`${site}/?kora`);
  await visitor.page.getByRole("button", { name: "Ouvrir Kora" }).click();
  return visitor;
}

const seenAt = async (member: Member) => (await call("/api/deliverables/1/site-key", { person: member })).json.seenAt;

async function board(browser: Browser, alice: Member) {
  const { page, errors } = await newPerson(browser);
  await signInPage(page, alice.email);
  await page.goto("/projets/1/livrables/1");
  const step = page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: "Installez la barre Kora" }) });
  await expect(step).toBeVisible();
  return { page, errors, step };
}

test("the first step gives the line for the site's tool, and says live when the toolbar is seen on the site", async ({ browser }) => {
  const { alice, key } = await linkDeliverable();
  const { errors, step } = await board(browser, alice);
  const line = step.getByLabel("Script de recette");
  // By default, a line for any site, before </body>.
  await expect(line).toHaveValue(`<script src="${baseURL}/kora-toolbar.js" data-site="${key}" defer></script>`);
  await expect(step.getByRole("button", { name: "HTML" })).toHaveAttribute("aria-pressed", "true");
  // A Next.js site: a Script in app/layout.tsx, the trap of a script pasted in a page.
  await step.getByRole("group", { name: "Votre site est fait avec" }).getByRole("button", { name: "Next.js" }).click();
  await expect(line).toHaveValue(`<Script src="${baseURL}/kora-toolbar.js" data-site="${key}" strategy="afterInteractive" />`);
  await expect(step).toContainText("app/layout.tsx");
  await step.getByRole("button", { name: "WordPress" }).click();
  await expect(line).toHaveValue(`<script src="${baseURL}/kora-toolbar.js" data-site="${key}" defer></script>`);
  await expect(step).toContainText("Insert Headers and Footers");

  // Not seen yet: said, with where to look.
  const status = step.getByRole("status");
  await expect(status).toContainText("En attente de la barre sur recette.boreal.test");
  // The site opens with the line: the step says so by itself, without reloading.
  const visitor = await openSite(browser, key);
  await expect(status).toContainText("Barre détectée sur recette.boreal.test", { timeout: 15_000 });
  expect(errors).toEqual([]);
  expect(visitor.errors).toEqual([]);
});

test("only the deliverable's own site, loading the panel in a frame, counts as seen; the client never learns of it", async () => {
  const { alice, token, key } = await linkDeliverable();
  const frame = (parent: string, dest = "iframe") =>
    fetch(`${baseURL}/review/site/${encodeURIComponent(key)}?parent=${encodeURIComponent(parent)}`, { headers: { "sec-fetch-dest": dest }, redirect: "manual" });
  // Another site claiming the line, the page opened directly, a line changed by hand: nothing recorded.
  await frame("https://autre-site.test");
  await frame(site, "document");
  await fetch(`${baseURL}/review/site/${encodeURIComponent(`${key}x`)}?parent=${encodeURIComponent(site)}`, { headers: { "sec-fetch-dest": "iframe" } });
  expect(await seenAt(alice)).toBeNull();
  // The deliverable's site: recorded, once (asked again soon, nothing is written).
  await frame(site);
  const first = await seenAt(alice);
  expect(typeof first).toBe("string");
  await frame(site);
  expect(await seenAt(alice)).toBe(first);
  expect(await sql("select 1 from settings where organization_id = $1 and key = 'siteSeen'", [alice.organizationId])).toHaveLength(1);

  // Another agency asks: unknown to it.
  const stranger = await signUp("Sam Dehors");
  await createAgency(stranger, "Autre Studio");
  expect((await call("/api/deliverables/1/site-key", { person: stranger })).status).toBe(404);
  // The client's page never carries it.
  const email = `${unique("claire")}@boreal.test`;
  await call("/api/review-access/invite", { person: alice, body: { linkKey: "1:1", emails: [email] } });
  const client = await verifiedClient(token, email);
  const review = await call(`/api/review/${token}`, { person: client });
  expect(review.status).toBe(200);
  expect(JSON.stringify(review.json)).not.toContain("siteSeen");
});
