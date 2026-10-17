// The Kora toolbar on an agency's staging site (US-048, public/kora-toolbar.js): the client verifies
// their address in Kora's panel, framed on the site, and places requests on its elements. The panel
// opens on the deliverable's own site only, and the site's page never holds what the client wrote.
// The staging site is served by the test itself, on another origin than Kora.

import { expect, test, type Browser, type Page } from "@playwright/test";
import { baseURL } from "../../playwright.config";
import { call, clientAction, createAgency, newPerson, seedState, signUp, sql, unique, verifiedClient, waitForCode } from "./helpers";

const site = "https://recette.northwind.test";

const sitePage = (token: string, title = "Bienvenue chez Northwind") => `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>Recette</title></head>
<body>
  <h1 id="titre">${title}</h1>
  <section><p>Nos offres</p><p>Nos tarifs</p></section>
  <script src="${baseURL}/kora-toolbar.js" data-review="${token}" defer></script>
</body></html>`;

/** The « Lien » deliverable whose address is the staging site. */
const siteDeliverable = (url: string) => ({ id: 1, projectId: 1, name: "Site de recette", type: "Link", url, version: 1, status: "En attente client", importedAt: "17/10/2026 10:00", locked: false });

/** An agency whose shared version is the staging site `site`, with a decider invited. */
async function siteReview() {
  const alice = await signUp("Alice Martin");
  await createAgency(alice, "Studio Recette");
  const token = unique("tok-site");
  await seedState(alice, {
    lists: {
      clients: { upsert: [{ id: 1, name: "Northwind" }], remove: [] },
      projects: { upsert: [{ id: 1, name: "Refonte", clientId: 1, client: "Northwind", status: "En cours" }], remove: [] },
      deliverables: { upsert: [siteDeliverable(`${site}/`)], remove: [] },
    },
    maps: { reviewLinks: { upsert: { "1:1": { token, active: true, expiresAt: "01/01/2099", autoExpire: true, deliverableId: 1, version: 1 } }, remove: [] } },
  });
  const email = `${unique("claire")}@client.test`;
  await call("/api/review-access/invite", { person: alice, body: { linkKey: "1:1", emails: [email] } });
  return { alice, org: alice.organizationId!, token, email };
}

/**
 * A page of another site, as a public site would be. Kora runs on localhost here: Chrome lets a public
 * page reach it only with the local network permission, which Kora online never needs.
 */
async function otherSitePerson(browser: Browser) {
  const person = await newPerson(browser);
  await person.page.context().grantPermissions(["local-network-access"]);
  return person;
}

/** A visitor of the staging site, served at `origin` with the toolbar of `token`. */
async function siteVisitor(browser: Browser, token: string, origin = site) {
  const { page, errors } = await otherSitePerson(browser);
  await page.context().route(`${origin}/**`, (route) => route.fulfill({ contentType: "text/html; charset=utf-8", body: sitePage(token) }));
  return { page, errors, panel: page.frameLocator('iframe[title="Kora"]') };
}

/** Opens the panel and verifies the address there, as the client does the first time. */
async function verifyInPanel(page: Page, email: string) {
  const panel = page.frameLocator('iframe[title="Kora"]');
  await page.getByRole("button", { name: "Ouvrir Kora" }).click();
  await panel.getByLabel("Votre e-mail").fill(email);
  await panel.getByRole("button", { name: "Recevoir un code" }).click();
  await panel.getByLabel("Code").fill(await waitForCode(email));
  await panel.getByRole("button", { name: "Accéder à la revue" }).click();
  await panel.getByLabel("Nom complet").fill("Claire Dubois");
  await panel.getByRole("button", { name: "Accéder à la revue" }).click();
  await expect(panel.getByRole("heading", { name: "Demandes de cette page" })).toBeVisible();
}

const siteRequests = (org: string) => sql<{ id: string; data: Record<string, unknown> }>("select id, data from comments where organization_id = $1 and data ? 'site' order by id", [org]);
/** Everything the site's page holds: its document and the toolbar's shadow tree. */
const siteMarkup = (page: Page) => page.evaluate(() => document.documentElement.outerHTML + (document.querySelector("[data-kora-toolbar]")?.shadowRoot?.innerHTML ?? ""));

test("the client verifies in Kora's panel on the staging site and places a request on an element", async ({ browser }) => {
  const { org, token, email } = await siteReview();
  const { page, errors, panel } = await siteVisitor(browser, token);

  // Without ?kora the toolbar stays hidden: a visitor of the site sees nothing of Kora.
  await page.goto(`${site}/`);
  await expect(page.getByRole("heading", { name: "Bienvenue chez Northwind" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Ouvrir Kora" })).toHaveCount(0);

  await page.goto(`${site}/?kora`);
  await verifyInPanel(page, email);

  await panel.getByRole("button", { name: "Poser une demande" }).click();
  await page.getByRole("heading", { name: "Bienvenue chez Northwind" }).click({ position: { x: 20, y: 10 } });
  await expect(panel.getByText("h1 « Bienvenue chez Northwind »")).toBeVisible();
  const message = "Le titre doit tenir sur une ligne";
  await panel.getByLabel("Votre demande").fill(message);
  await panel.getByRole("button", { name: "Envoyer" }).click();

  // Stored as a request of the client, signed by the server, with where it was placed.
  await expect.poll(async () => (await siteRequests(org)).length).toBe(1);
  const [created] = await siteRequests(org);
  expect(created.data).toMatchObject({ from: "client", authorEmail: email, author: "Claire Dubois", message, location: "/", decision: "À qualifier" });
  expect(created.data.site).toMatchObject({ url: "/", selector: "#titre", viewport: 1400 });
  await expect(page.getByRole("button", { name: "Demande 1" })).toBeVisible();
  // The site's page holds the pin's number and place, never the text.
  expect(await siteMarkup(page)).not.toContain(message);

  // Back on the site later: the pin is there, and the session holds on this site.
  await page.reload();
  await expect(page.getByRole("button", { name: "Demande 1" })).toBeVisible();
  await page.getByRole("button", { name: "Demande 1" }).click();
  await expect(panel.getByRole("button", { name: new RegExp(message) })).toBeVisible();
  await expect(panel.getByRole("button", { name: "Recevoir un code" })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("the panel opens on the deliverable's own site only, in https: another site, a site in http, or a page lying about its origin, gets nothing", async ({ browser }) => {
  const { alice, token } = await siteReview();

  // The panel's address names its parent; the proxy lets only that origin frame it…
  const framed = await call(`/review/${token}/site?parent=${encodeURIComponent(site)}`);
  expect(framed.response.headers.get("content-security-policy")).toContain(`frame-ancestors ${site}`);
  expect(framed.response.headers.get("x-frame-options")).toBeNull();
  // …every other page of Kora still refuses any frame.
  expect((await call(`/review/${token}`)).response.headers.get("x-frame-options")).toBe("DENY");
  // A parent that is not a bare origin frames nothing.
  const bogus = await call(`/review/${token}/site?parent=${encodeURIComponent(`${site}/autre`)}`);
  expect(bogus.response.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");

  // …and the page shows nothing when that origin is not the deliverable's site.
  const elsewhere = await call(`/review/${token}/site?parent=${encodeURIComponent("https://autre.test")}`);
  expect(String(elsewhere.json)).toContain("ne s’ouvre que sur le site de la revue");
  expect(String(elsewhere.json)).not.toContain("Recevoir un code");

  // A staging site in http (but on this computer): a page anyone on the way could rewrite frames nothing.
  await seedState(alice, { lists: { deliverables: { upsert: [siteDeliverable("http://recette.northwind.test/")], remove: [] } } });
  const unsecured = await call(`/review/${token}/site?parent=${encodeURIComponent("http://recette.northwind.test")}`);
  expect(String(unsecured.json)).toContain("ne s’ouvre que sur le site de la revue");
  await seedState(alice, { lists: { deliverables: { upsert: [siteDeliverable(`${site}/`)], remove: [] } } });

  // The toolbar copied onto another site: the panel refuses to open there.
  const other = await siteVisitor(browser, token, "https://autre.test");
  await other.page.goto("https://autre.test/?kora");
  await other.page.getByRole("button", { name: "Ouvrir Kora" }).click();
  await expect(other.panel.getByText("ne s’ouvre que sur le site de la revue")).toBeVisible();
  await expect(other.panel.getByRole("button", { name: "Recevoir un code" })).toHaveCount(0);

  // A page of another site framing the panel while naming the right site: the browser refuses the frame.
  const liar = await otherSitePerson(browser);
  await liar.page.context().route("https://piege.test/**", (route) =>
    route.fulfill({ contentType: "text/html", body: `<!doctype html><iframe title="Kora" src="${baseURL}/review/${token}/site?parent=${encodeURIComponent(site)}"></iframe>` }),
  );
  await liar.page.goto("https://piege.test/");
  await expect.poll(() => liar.errors.some((error) => /violates the following Content Security Policy directive: "frame-ancestors/.test(error))).toBe(true);
  await expect(liar.page.frameLocator('iframe[title="Kora"]').getByRole("button", { name: "Recevoir un code" })).toHaveCount(0);
});

test("the site shows the pins the client may see, and says when an element is gone", async ({ browser }) => {
  const { alice, org, token, email } = await siteReview();
  const anchor = (selector: string) => ({ url: "/", selector, x: 10, y: 50, viewport: 1400 });
  await seedState(alice, {
    lists: {
      comments: {
        upsert: [
          // Shown: the agency chose « Inclus ».
          { id: 20, deliverableId: 1, author: "Alice Martin", initials: "AM", from: "agency", message: "Agrandir le titre", title: "Titre plus grand", decision: "Inclus", kind: "request", location: "/", time: "t", site: anchor("#titre") },
          // Internal: a pin of the agency without a status.
          { id: 21, deliverableId: 1, author: "Alice Martin", initials: "AM", from: "agency", message: "Penser à la marge interne", decision: "À qualifier", kind: "remark", location: "/", time: "t", site: anchor("section > p:nth-of-type(1)") },
          // Shown, on an element the site no longer has.
          { id: 22, deliverableId: 1, author: "Alice Martin", initials: "AM", from: "agency", message: "Ancienne bannière", title: "Bannière", decision: "Inclus", kind: "request", location: "/", time: "t", site: anchor("#banniere") },
        ],
        remove: [],
      },
    },
  });
  const { page, panel } = await siteVisitor(browser, token);
  await page.goto(`${site}/?kora`);
  await verifyInPanel(page, email);

  await expect(page.getByRole("button", { name: /^Demande \d+$/ })).toHaveCount(1);
  await expect(panel.getByRole("listitem")).toHaveCount(2);
  await expect(panel.getByRole("listitem").filter({ hasText: "Bannière" }).getByText("Élément introuvable sur la page")).toBeVisible();
  await expect(panel.getByText("Penser à la marge interne")).toHaveCount(0);
  expect(await siteMarkup(page)).not.toContain("marge interne");

  // A malformed placement is not kept: the request is filed without it (another invited person, by the route).
  const other = `${unique("marc")}@client.test`;
  await call("/api/review-access/invite", { person: alice, body: { linkKey: "1:1", emails: [other] } });
  const person = await verifiedClient(token, other, "Marc Petit");
  const sent = await clientAction(person, token, "comments", "POST", { message: "Ailleurs", site: { url: "https://piege.test/x", selector: "h1", x: 1, y: 1, viewport: 1400 } });
  expect(sent.status).toBe(200);
  const [stored] = await sql<{ data: Record<string, unknown> }>("select data from comments where organization_id = $1 and data->>'message' = 'Ailleurs'", [org]);
  expect(stored.data.site).toBeUndefined();
});
