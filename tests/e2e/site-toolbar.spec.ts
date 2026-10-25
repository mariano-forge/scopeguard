// The Kora toolbar on an agency's staging site (US-048, public/kora-toolbar.js): the client verifies
// their address in Kora's panel, framed on the site, and places requests on its elements. The panel
// opens on the deliverable's own site only, and the site's page never holds what the client wrote.
// The staging site is served by the test itself, on another origin than Kora.

import { expect, test, type Browser, type Page } from "@playwright/test";
import { baseURL } from "../../playwright.config";
import { addColleague, call, clientAction, makePdf, mailsTo, upload, createAgency, headers, newIp, newPerson, seedState, signInPage, signUp, sql, unique, verifiedClient, waitForCode, waitForMail, type Member, type Person } from "./helpers";

const site = "https://recette.northwind.test";
/** A 1×1 PNG, built here so the tests need no file on disk. */
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

/** Sends a capture as the panel does (POST …/site/capture). */
async function sendCapture(person: Partial<Person>, token: string, content: Buffer, type = "image/png") {
  const form = new FormData();
  form.set("file", new Blob([new Uint8Array(content)], { type }), "capture.png");
  const response = await fetch(`${baseURL}/api/review/${token}/site/capture`, { method: "POST", headers: { origin: baseURL, cookie: person.cookie ?? "", "x-forwarded-for": person.ip ?? newIp() }, body: form });
  return { status: response.status, json: (await response.json().catch(() => ({}))) as { href?: string; error?: string } };
}

/** The staging site's page, with the toolbar's line: `script` is its data-site (the fixed key) or data-review attribute. */
const sitePage = (script: string, title = "Bienvenue chez Northwind") => `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>Recette</title></head>
<body>
  <h1 id="titre">${title}</h1>
  <section><p>Nos offres</p><p>Nos tarifs</p></section>
  <script src="${baseURL}/kora-toolbar.js" ${script} defer></script>
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
  // The line « Partager la revue » gives: the deliverable's fixed key.
  const key = (await call("/api/deliverables/1/site-key", { person: alice })).json.key as string;
  return { alice, org: alice.organizationId!, token, email, key, script: `data-site="${key}"` };
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
async function siteVisitor(browser: Browser, script: string, origin = site) {
  const { page, errors } = await otherSitePerson(browser);
  await page.context().route(`${origin}/**`, (route) => route.fulfill({ contentType: "text/html; charset=utf-8", body: sitePage(script) }));
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
  await expect(panel.getByRole("heading", { name: "Commentaires", exact: true })).toBeVisible();
}

const siteRequests = (org: string) => sql<{ id: string; data: Record<string, unknown> }>("select id, data from comments where organization_id = $1 and data ? 'site' order by id", [org]);
/** Everything the site's page holds: its document and the toolbar's shadow tree. */
const siteMarkup = (page: Page) => page.evaluate(() => document.documentElement.outerHTML + (document.querySelector("[data-kora-toolbar]")?.shadowRoot?.innerHTML ?? ""));

test("the client verifies in Kora's panel on the staging site and places a request on an element", async ({ browser }) => {
  const { alice, org, email, script } = await siteReview();
  const { page, errors, panel } = await siteVisitor(browser, script);

  // Without ?kora the toolbar stays hidden: a visitor of the site sees nothing of Kora.
  await page.goto(`${site}/`);
  await expect(page.getByRole("heading", { name: "Bienvenue chez Northwind" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Ouvrir Kora" })).toHaveCount(0);

  await page.goto(`${site}/?kora`);
  // Folded, the bar is the « Kora » pill alone; opening Kora unfolds its tools.
  await expect(page.getByRole("button", { name: "Commenter" })).toBeHidden();
  await verifyInPanel(page, email);
  // The list put away, the page is whole again: a comment then opens in a bubble beside its click.
  await panel.getByRole("button", { name: "Fermer les commentaires" }).click();

  // Kora's two tools on the floating bar: « Naviguer » by default, « Commenter » until Escape (or V).
  const browse = page.getByRole("button", { name: "Naviguer" });
  const comment = page.getByRole("button", { name: "Commenter" });
  await expect(browse).toHaveAttribute("aria-pressed", "true");
  await comment.click();
  await expect(comment).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("status").filter({ hasText: "Cliquez sur l’élément à commenter" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(browse).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("c");
  await expect(comment).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("heading", { name: "Bienvenue chez Northwind" }).click({ position: { x: 20, y: 10 } });
  // Kora's bubble opens beside the click, as on Kora's canvas: what was clicked, then the comment.
  const frame = page.getByRole("dialog", { name: "Kora", exact: true });
  const [heading, bubbleBox] = [(await page.getByRole("heading", { name: "Bienvenue chez Northwind" }).boundingBox())!, await frame.boundingBox()];
  expect(bubbleBox!.width).toBeLessThanOrEqual(340);
  expect(Math.abs(bubbleBox!.y - heading.y)).toBeLessThan(80);
  await expect(panel.getByText("h1 « Bienvenue chez Northwind »")).toBeVisible();
  const message = "Le titre doit tenir sur une ligne";
  await panel.getByLabel("Votre commentaire").fill(message);
  await panel.getByRole("button", { name: "Envoyer" }).click();

  // Stored as a request of the client, signed by the server, with where it was placed. (The capture of the
  // page is sent first: it takes longer on a loaded machine, as for the agency's comment below.)
  await expect.poll(async () => (await siteRequests(org)).length, { timeout: 30_000 }).toBe(1);
  // The tool stays « Commenter » after a request, as on Kora's canvas.
  await expect(comment).toHaveAttribute("aria-pressed", "true");
  const [created] = await siteRequests(org);
  expect(created.data).toMatchObject({ from: "client", authorEmail: email, author: "Claire Dubois", message, location: "/", decision: "À qualifier" });
  expect(created.data.site).toMatchObject({ url: "/", selector: "#titre", viewport: 1400, capture: expect.stringMatching(/^\/api\/files\/[0-9a-f-]{36}$/) });
  // The capture of the window, sent by the client themselves, stored as an image of the agency…
  const fileId = String((created.data.site as Record<string, unknown>).capture).split("/").pop();
  const [stored] = await sql<{ uploaded_by: string; mime_type: string; path: string }>("select uploaded_by, mime_type, path from stored_files where organization_id = $1 and id = $2", [org, fileId]);
  expect(stored).toMatchObject({ uploaded_by: `client:${email}`, mime_type: "image/jpeg" });
  expect(stored.path).toMatch(/^projets\/1\/livrables\/1\/demandes\//);
  // …annotated: at the click, the image holds Kora's point (#30a8ff), not the page's white.
  const view = (created.data.site as { view: { x: number; y: number } }).view;
  const bytes = Buffer.from(await (await fetch(`${baseURL}${(created.data.site as { capture: string }).capture}`, { headers: { cookie: alice.cookie } })).arrayBuffer());
  const colourAt = (point: { x: number; y: number }) =>
    page.evaluate(
      async ({ data, x, y }) => {
        const image = new Image();
        image.src = data;
        await image.decode();
        const canvas = Object.assign(document.createElement("canvas"), { width: image.width, height: image.height });
        const context = canvas.getContext("2d")!;
        context.drawImage(image, 0, 0);
        return [...context.getImageData(Math.round((image.width * x) / 100), Math.round((image.height * y) / 100), 1, 1).data.slice(0, 3)];
      },
      { data: `data:image/jpeg;base64,${bytes.toString("base64")}`, ...point },
    );
  const [red, , blue] = await colourAt(view);
  expect(blue).toBeGreaterThan(200);
  expect(red).toBeLessThan(140);
  // Far from it, the page as it is (white).
  expect((await colourAt({ x: 98, y: 98 }))[0]).toBeGreaterThan(200);
  // …and read through the panel's session (on the site, the bubble does not repeat it: the element is there).
  const kora = page.frames().find((candidate) => candidate.url().startsWith(baseURL))!;
  expect(await kora.evaluate((href) => fetch(href).then((response) => response.ok), String((created.data.site as { capture: string }).capture))).toBe(true);
  // On the site, Kora's pin: a comment shows its author's initials.
  const pin = page.getByRole("button", { name: `Commentaire #${created.id}` });
  await expect(pin).toHaveText("CD");
  // The site's page holds the pin's place, status and initials, never the text.
  expect(await siteMarkup(page)).not.toContain(message);

  // Back on the site later: the pin is there, and the session holds on this site.
  await page.reload();
  await page.getByRole("button", { name: `Commentaire #${created.id}` }).click();
  await expect(panel.getByRole("dialog", { name: `Commentaire #${created.id}` })).toContainText(message);
  await expect(panel.getByRole("button", { name: "Recevoir un code" })).toHaveCount(0);
  // « Réduire Kora » folds everything back into the pill.
  await page.getByRole("button", { name: "Réduire Kora" }).click();
  await expect(page.getByRole("dialog", { name: "Kora", exact: true })).toBeHidden();
  await expect(page.getByRole("button", { name: "Commenter" })).toBeHidden();
  await expect(page.getByRole("button", { name: "Ouvrir Kora" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("the panel opens on the deliverable's own site only, in https: another site, a site in http, or a page lying about its origin, gets nothing", async ({ browser }) => {
  const { alice, token, script } = await siteReview();

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
  expect(String(elsewhere.json)).toContain("Ce n’est pas le site de ce livrable");
  expect(String(elsewhere.json)).not.toContain("Recevoir un code");

  // A staging site in http (but on this computer): a page anyone on the way could rewrite frames nothing.
  await seedState(alice, { lists: { deliverables: { upsert: [siteDeliverable("http://recette.northwind.test/")], remove: [] } } });
  const unsecured = await call(`/review/${token}/site?parent=${encodeURIComponent("http://recette.northwind.test")}`);
  expect(String(unsecured.json)).toContain("Ce n’est pas le site de ce livrable");
  await seedState(alice, { lists: { deliverables: { upsert: [siteDeliverable(`${site}/`)], remove: [] } } });

  // The toolbar copied onto another site: the panel refuses to open there.
  const other = await siteVisitor(browser, script, "https://autre.test");
  await other.page.goto("https://autre.test/?kora");
  await other.page.getByRole("button", { name: "Ouvrir Kora" }).click();
  await expect(other.panel.getByText("Ce n’est pas le site de ce livrable")).toBeVisible();
  // It says so to the agency as well as the client, naming the page it was opened on, never the deliverable's address.
  await expect(other.panel.getByText(/pour l’administrateur comme pour le décideur/)).toBeVisible();
  await expect(other.panel.getByText(/pour commenter sur https:\/\/autre\.test, créez dans Kora une nouvelle version/)).toBeVisible();
  await expect(other.panel.getByText("recette.northwind.test")).toHaveCount(0);
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
  const { alice, org, token, email, script } = await siteReview();
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
  const { page, panel } = await siteVisitor(browser, script);
  await page.goto(`${site}/?kora`);
  await verifyInPanel(page, email);

  // Only the pin the client sees, on an element the page has: Kora's « Inclus » tag.
  await expect(page.getByRole("button", { name: /#\d+$/ })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Demande incluse #20" }).locator("svg")).toBeVisible();
  // In Kora's list, the comments of the page the client may see: the two requests, without the follow-up's statuses.
  const list = panel.getByRole("list", { name: "Commentaires de la page" });
  await expect(list.getByRole("button")).toHaveCount(2);
  await expect(panel.getByRole("tab")).toHaveCount(0);
  await list.getByRole("button", { name: "Demande incluse #22" }).click();
  await expect(panel.getByText("Élément introuvable sur la page")).toBeVisible();
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

test("a long list of the page's comments scrolls between its header and its footer, which stay in place", async ({ browser }) => {
  const { alice, email, script } = await siteReview();
  const request = (id: number) => ({ id, deliverableId: 1, author: "Alice Martin", initials: "AM", from: "agency", message: `Demande ${id}`, title: `Demande ${id}`, decision: "Inclus", kind: "request", location: "/", time: "t", site: { url: "/", selector: "#titre", x: 10, y: 50, viewport: 1400 } });
  await seedState(alice, { lists: { comments: { upsert: Array.from({ length: 16 }, (_, index) => request(30 + index)), remove: [] } } });
  const { page, panel } = await siteVisitor(browser, script);
  await page.setViewportSize({ width: 1280, height: 600 });
  await page.goto(`${site}/?kora`);
  await verifyInPanel(page, email);

  const list = panel.getByRole("list", { name: "Commentaires de la page" });
  await expect(list.getByRole("button")).toHaveCount(16);
  // The list scrolls, on its own; once at its end, the close button and the way to Kora are still in sight.
  expect(await list.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  await list.evaluate((element) => element.scrollTo({ top: element.scrollHeight }));
  await expect(list.getByRole("button", { name: "Demande incluse #45" })).toBeInViewport();
  await expect(panel.getByRole("button", { name: "Fermer les commentaires" })).toBeInViewport();
  await expect(panel.getByRole("button", { name: "Ouvrir la revue dans Kora" })).toBeInViewport();
});

test("once in, Kora's logo opens the bar alone: the list of comments opens when asked, and closes without folding the bar", async ({ browser }) => {
  const { alice, email, script } = await siteReview();
  await seedState(alice, {
    lists: { comments: { upsert: [{ id: 20, deliverableId: 1, author: "Alice Martin", initials: "AM", from: "agency", message: "Agrandir le titre", title: "Titre plus grand", decision: "Inclus", kind: "request", location: "/", time: "t", site: { url: "/", selector: "#titre", x: 10, y: 50, viewport: 1400 } }], remove: [] } },
  });
  const frame = (page: Page) => page.getByRole("dialog", { name: "Kora", exact: true });

  // Not in yet: « Commenter » (or C) opens Kora on the address to verify, and does not comment.
  const stranger = await siteVisitor(browser, script);
  await stranger.page.goto(`${site}/?kora`);
  await stranger.page.keyboard.press("c");
  await expect(stranger.panel.getByLabel("Votre e-mail")).toBeVisible();
  await expect(stranger.page.getByRole("button", { name: "Commenter" })).toHaveAttribute("aria-pressed", "false");

  const { page, panel, errors } = await siteVisitor(browser, script);
  await page.goto(`${site}/?kora`);
  await verifyInPanel(page, email);
  // The list closed from its header: the bar stays, with its tools.
  await panel.getByRole("button", { name: "Fermer les commentaires" }).click();
  await expect(frame(page)).toBeHidden();
  await expect(page.getByRole("button", { name: "Commenter" })).toBeVisible();
  await page.getByRole("button", { name: "Réduire Kora" }).click();
  await expect(page.getByRole("button", { name: "Commenter" })).toBeHidden();

  // Back later, in: the logo unfolds the bar without the list, which would hide the page.
  await page.reload();
  await expect(page.getByRole("button", { name: "Demande incluse #20" })).toBeVisible();
  await page.getByRole("button", { name: "Ouvrir Kora" }).click();
  const list = page.getByRole("button", { name: "Commentaires", exact: true });
  await expect(page.getByRole("button", { name: "Commenter" })).toBeVisible();
  await expect(frame(page)).toBeHidden();
  await expect(list).toHaveAttribute("aria-pressed", "false");
  // « Commentaires » shows the list, and puts it away.
  await list.click();
  await expect(frame(page)).toBeVisible();
  await expect(panel.getByRole("list", { name: "Commentaires de la page" }).getByRole("button")).toHaveCount(1);
  await expect(list).toHaveAttribute("aria-pressed", "true");
  // A comment opened, from the list or its pin, shows in the list: it stays open on the right, a way back to all.
  const listBox = (await frame(page).boundingBox())!;
  await page.getByRole("button", { name: "Demande incluse #20" }).click();
  await expect(panel.getByRole("dialog", { name: /#20$/ })).toContainText("Titre plus grand");
  await expect(panel.getByRole("heading", { name: "Commentaires", exact: true })).toBeVisible();
  expect((await frame(page).boundingBox())!).toEqual(listBox);
  // One cross only, the list's; on the bar, the list's button shows a single icon: the cross that closes it.
  await expect(panel.getByRole("dialog", { name: /#20$/ }).getByRole("button", { name: "Fermer" })).toBeHidden();
  await expect(list.locator("svg:visible")).toHaveCount(1);
  await panel.getByRole("button", { name: "Tous les commentaires" }).click();
  await expect(panel.getByRole("list", { name: "Commentaires de la page" })).toBeVisible();
  await list.click();
  await expect(frame(page)).toBeHidden();
  await expect(list).toHaveAttribute("aria-pressed", "false");
  // Commenting needs no list: the bubble opens beside the click.
  await page.getByRole("button", { name: "Commenter" }).click();
  await page.getByRole("heading", { name: "Bienvenue chez Northwind" }).click({ position: { x: 20, y: 10 } });
  await expect(panel.getByLabel("Votre commentaire")).toBeVisible();
  expect((await frame(page).boundingBox())!.width).toBeLessThanOrEqual(340);
  expect(errors).toEqual([]);
});

// ——— The agency in the panel ———

const anchorOn = (selector: string) => ({ url: "/", selector, x: 10, y: 50, viewport: 1400 });

/** The panel's agency session of `member`: their address verified by a code in the panel, as an invited client's is, as a cookie. */
async function siteAgencySession(member: Member, token: string): Promise<Person> {
  const ticket = await call(`/api/review/${token}/site/ticket`, { person: member, body: {} });
  expect(ticket.status).toBe(200);
  const ip = newIp();
  const opened = await fetch(`${baseURL}/api/review/${token}/site/session`, { method: "POST", headers: headers({ ip }), body: JSON.stringify({ ticket: ticket.json.ticket }) });
  expect(opened.status).toBe(200);
  return { cookie: opened.headers.getSetCookie().map((cookie) => cookie.split(";")[0]).join("; "), ip };
}

test("an agency member is recognised in the panel by a Kora window, never by a code, then annotates and qualifies on the site", async ({ browser }) => {
  const { alice, org, script } = await siteReview();
  await seedState(alice, {
    lists: {
      comments: {
        upsert: [
          { id: 30, deliverableId: 1, author: "Claire Dubois", initials: "CD", from: "client", authorEmail: "claire@client.test", message: "Le titre est trop long", decision: "À qualifier", kind: "remark", location: "/", time: "t", site: anchorOn("#titre") },
          { id: 31, deliverableId: 1, author: "Alice Martin", initials: "AM", from: "agency", message: "Revoir l’interligne", decision: "À qualifier", kind: "remark", internalNote: true, location: "/", time: "t", site: anchorOn("section > p:nth-of-type(1)") },
        ],
        remove: [],
      },
    },
  });
  const { page, errors, panel } = await siteVisitor(browser, script);
  await page.goto(`${site}/?kora`);
  await page.getByRole("button", { name: "Ouvrir Kora" }).click();
  // The clients' door is not the agency's: a member's address is answered as any uninvited one, no code sent.
  await panel.getByLabel("Votre e-mail").fill(alice.email);
  await panel.getByRole("button", { name: "Recevoir un code" }).click();
  await expect(panel.getByText("n’est pas invitée sur cette revue")).toBeVisible();
  expect(mailsTo(alice.email).some((mail) => /est votre code/.test(mail.subject))).toBe(false);
  // The agency's door: a Kora window, where the member's Kora session is (signed in, as in another tab).
  await page.context().addCookies(alice.cookie.split("; ").map((pair) => ({ name: pair.split("=")[0], value: pair.slice(pair.indexOf("=") + 1), url: baseURL })));
  await page.reload();
  await page.getByRole("button", { name: "Ouvrir Kora" }).click();
  const popup = page.waitForEvent("popup");
  await panel.getByRole("button", { name: "Je suis de l’organisation" }).click();
  const window = await popup;
  const closed = window.waitForEvent("close");
  await window.getByRole("button", { name: "Continuer en tant que Alice Martin" }).click();
  await closed;
  // Recognised as a member of the agency: no name to give, the list of the page's comments, its draft included.
  await expect(panel.getByRole("heading", { name: "Commentaires", exact: true })).toBeVisible();
  await expect(panel.getByRole("list", { name: "Commentaires de la page" }).getByRole("button")).toHaveCount(2);

  // The agency sees its draft pin too, Kora's blue one, as in Kora; its thread opens in a bubble beside the pin.
  await expect(page.getByRole("button", { name: "Commentaire #30" })).not.toHaveClass(/is-agency/);
  await expect(page.getByRole("button", { name: "Commentaire #31" })).toHaveClass(/is-agency/);
  await page.getByRole("button", { name: "Commentaire #31" }).click();
  await expect(panel.getByRole("dialog", { name: /#31$/ })).toBeVisible();

  // A comment of its own on the site: an internal pin, as in Kora.
  await page.getByRole("button", { name: "Commenter" }).click();
  await page.getByRole("heading", { name: "Bienvenue chez Northwind" }).click({ position: { x: 40, y: 10 } });
  await panel.getByLabel("Votre commentaire").fill("Vérifier le contraste du titre");
  await panel.getByRole("button", { name: "Envoyer" }).click();
  // (The capture of the page is sent first: it takes longer on a loaded machine.)
  await expect
    .poll(async () => (await sql<{ data: Record<string, unknown> }>("select data from comments where organization_id = $1 and data->>'message' = 'Vérifier le contraste du titre'", [org]))[0]?.data, { timeout: 30_000 })
    .toMatchObject({ from: "agency", author: "Alice Martin", internalNote: true, location: "/", decision: "À qualifier", site: { url: "/", selector: "#titre" } });

  // The client's request, qualified from the site. The comment just posted shows its thread first, in the
  // list still open: back to all, Kora shows the list again.
  const posted = panel.getByRole("dialog", { name: /^Commentaire #/ });
  await expect(posted).toBeVisible();
  await panel.getByRole("button", { name: "Tous les commentaires" }).click();
  await expect(panel.getByRole("heading", { name: "Commentaires", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Commentaire #30" }).click();
  await panel.getByRole("button", { name: "Qualifier", exact: true }).click();
  // The bubble grows with the qualifying form: its whole height, not a cut-off part of it.
  await expect.poll(async () => (await page.getByRole("dialog", { name: "Kora", exact: true }).boundingBox())!.height).toBeGreaterThan(300);
  await panel.getByRole("radio", { name: /^Inclus/ }).click();
  await panel.getByLabel("Titre de la demande").fill("Raccourcir le titre");
  await panel.getByRole("button", { name: "Créer la demande" }).click();
  await expect
    .poll(async () => (await sql<{ decision: string; title: string }>("select decision, data->>'title' as title from comments where organization_id = $1 and id = 30", [org]))[0])
    .toEqual({ decision: "Inclus", title: "Raccourcir le titre" });
  expect(errors).toEqual([]);
});

test("from the site, the agency only comments and qualifies on its version: quotes, other versions and Kora's state answer no", async () => {
  const { alice, token } = await siteReview();
  const otherToken = unique("tok-other");
  await seedState(alice, {
    lists: {
      deliverables: { upsert: [{ id: 2, projectId: 1, name: "Maquette", type: "Image", version: 1, status: "En attente client", importedAt: "17/10/2026 10:00", locked: false }], remove: [] },
      comments: {
        upsert: [
          { id: 40, deliverableId: 1, author: "Claire Dubois", initials: "CD", from: "client", message: "Ajouter une page Équipe", decision: "Hors périmètre", kind: "request", title: "Page Équipe", location: "/", time: "t", site: anchorOn("#titre") },
          { id: 41, deliverableId: 2, author: "Claire Dubois", initials: "CD", from: "client", message: "Autre livrable", decision: "À qualifier", kind: "remark", location: "", time: "t" },
        ],
        remove: [],
      },
    },
    maps: { reviewLinks: { upsert: { "2:1": { token: otherToken, active: true, expiresAt: "01/01/2099", autoExpire: true, deliverableId: 2, version: 1 } }, remove: [] } },
  });
  const panel = await siteAgencySession(alice, token);

  // Allowed: a reply on its version.
  expect((await call("/api/comments/40/replies", { person: panel, body: { message: "On regarde" } })).status).toBe(200);
  // Refused: a quote is sent from Kora only…
  const quote = await call("/api/comments/40/proposal", { person: panel, body: { description: "Page Équipe", amount: 900, deadline: 3 } });
  expect(quote.status).toBe(403);
  expect(quote.json.code).toBe("KORA_ONLY");
  // …as is sharing; and a request of another version is unknown from this panel.
  expect((await call("/api/deliverables/1/review-link", { person: panel, body: {} })).json.code).toBe("KORA_ONLY");
  expect((await call("/api/comments/41/qualification", { method: "PUT", person: panel, body: { decision: "Inclus", title: "Autre" } })).status).toBe(404);
  // The panel's session is not a Kora session: the agency's whole state stays closed.
  expect((await call("/api/state", { person: panel })).status).toBe(401);
  // Nothing was written by the refusals.
  expect(await sql("select 1 from comment_proposals where organization_id = $1", [alice.organizationId])).toHaveLength(0);
  expect((await sql<{ decision: string }>("select decision from comments where organization_id = $1 and id = 41", [alice.organizationId]))[0].decision).toBe("À qualifier");

  // Opened on one link, the panel's session reaches that version only.
  const chloe = await addColleague(alice, "Chloe Martin", "member");
  const otherPanel = await siteAgencySession(chloe, otherToken);
  expect((await call("/api/comments/40/replies", { person: otherPanel, body: { message: "D’ailleurs" } })).status).toBe(404);
  // Codes are for clients: a member's address, in the panel or not, is answered as any uninvited one —
  // nothing tells it apart, no code goes, nothing opens.
  const dana = await addColleague(alice, "Dana Roux", "member");
  for (const site of [false, true]) {
    const asked = await call(`/api/review/${token}/access/code`, { body: { email: dana.email, site } });
    expect(asked.json).toEqual({ ok: true, invited: false });
    expect((await call(`/api/review/${token}/access/verify`, { body: { email: dana.email, code: "000000", site } })).status).toBe(400);
  }
  expect((await call(`/api/review/${token}/access/code`, { body: { email: `${unique("personne")}@ailleurs.test`, site: true } })).json).toEqual({ ok: true, invited: false });
  expect(mailsTo(dana.email).some((mail) => /est votre code/.test(mail.subject))).toBe(false);
  // A ticket opens only its own link, only for a member, only as signed.
  const ticket = (await call(`/api/review/${token}/site/ticket`, { person: alice, body: {} })).json.ticket as string;
  expect((await call(`/api/review/${otherToken}/site/session`, { body: { ticket } })).status).toBe(400);
  expect((await call(`/api/review/${token}/site/session`, { body: { ticket: `${ticket.slice(0, -2)}xx` } })).status).toBe(400);
  const stranger = await signUp("Sam Dehors");
  await createAgency(stranger, "Autre Studio");
  expect((await call(`/api/review/${token}/site/ticket`, { person: stranger, body: {} })).status).toBe(404);

  // Removed from the agency: the panel's session stops at once.
  const bob = await addColleague(alice, "Bob Durand", "member");
  const bobPanel = await siteAgencySession(bob, token);
  expect((await call("/api/comments/40/replies", { person: bobPanel, body: { message: "Vu" } })).status).toBe(200);
  expect((await call("/api/auth/organization/remove-member", { person: alice, body: { memberIdOrEmail: bob.email, organizationId: alice.organizationId } })).status).toBe(200);
  expect((await call("/api/comments/40/replies", { person: bobPanel, body: { message: "Encore" } })).status).toBe(401);

  // The link revoked: the panel's session stops at once too, routes and files alike.
  const capture = (await upload(alice, png, "capture.png", { kind: "request", projectId: 1, livrableId: 1 })).json.href!;
  const readFile = () => fetch(`${baseURL}${capture}`, { headers: { cookie: panel.cookie, "x-forwarded-for": newIp() }, redirect: "manual" }).then((response) => response.status);
  expect(await readFile()).toBe(302);
  expect((await call("/api/comments/40/replies", { person: panel, body: { message: "Avant" } })).status).toBe(200);
  expect((await call("/api/deliverables/1/review-link", { method: "DELETE", person: alice })).status).toBe(200);
  expect((await call("/api/comments/40/replies", { person: panel, body: { message: "Après" } })).status).toBe(401);
  expect(await readFile()).toBe(404);
});

// ——— From the site to the review page, without a second code ———

test("a quote waiting on the site is decided in Kora: the review opens in a tab without a second code", async ({ browser }) => {
  const { alice, token, email, script } = await siteReview();
  await seedState(alice, {
    lists: {
      comments: {
        upsert: [{ id: 50, deliverableId: 1, author: "Alice Martin", initials: "AM", from: "agency", message: "Une page Équipe", title: "Page Équipe", decision: "Hors périmètre", kind: "request", location: "/", time: "t", site: anchorOn("#titre") }],
        remove: [],
      },
    },
    maps: {
      proposalStates: { upsert: { "50": "sent" }, remove: [] },
      proposalVersions: { upsert: { "50": [{ id: 500, version: 1, commentId: 50, description: "Page Équipe", amount: 900, deadline: 3, status: "sent", createdAt: "x" }] }, remove: [] },
    },
  });
  const { page, errors, panel } = await siteVisitor(browser, script);
  await page.goto(`${site}/?kora`);
  await verifyInPanel(page, email);

  // Said in the list's footer, with the way to Kora, where it is decided.
  await expect(panel.getByRole("status").filter({ hasText: "1 devis attend votre décision." })).toBeVisible();
  const opened = page.context().waitForEvent("page");
  await panel.getByRole("button", { name: "Ouvrir la revue dans Kora" }).click();
  const review = await opened;
  await review.waitForURL(`${baseURL}/review/${token}`);
  // The usual review, opened by the panel's session: no code asked again.
  await expect(review.getByRole("button", { name: "Valider cette version" })).toBeVisible();
  await expect(review.getByRole("button", { name: "Recevoir un code" })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("the review page's ticket is given to a verified client only, opens its own link only, and stops with the invitation", async () => {
  const { alice, token, email } = await siteReview();
  const otherToken = unique("tok-other");
  await seedState(alice, { maps: { reviewLinks: { upsert: { "2:1": { token: otherToken, active: true, expiresAt: "01/01/2099", autoExpire: true, deliverableId: 2, version: 1 } }, remove: [] } } });

  // Nobody verified, or the agency's panel session: no ticket.
  expect((await call(`/api/review/${token}/site/handoff`, { body: {} })).status).toBe(401);
  expect((await call(`/api/review/${token}/site/handoff`, { person: await siteAgencySession(alice, token), body: {} })).status).toBe(401);

  const client = await verifiedClient(token, email);
  const ticket = (await call(`/api/review/${token}/site/handoff`, { person: client, body: {} })).json.ticket as string;
  expect(ticket).toBeTruthy();
  // Another link, a forged ticket: refused.
  expect((await call(`/api/review/${otherToken}/site/handoff/open`, { body: { ticket } })).status).toBe(400);
  expect((await call(`/api/review/${token}/site/handoff/open`, { body: { ticket: `${ticket.slice(0, -2)}xx` } })).status).toBe(400);
  // The right one opens the usual session…
  const opened = await call(`/api/review/${token}/site/handoff/open`, { body: { ticket } });
  expect(opened.status).toBe(200);
  expect(opened.response.headers.getSetCookie().some((cookie) => cookie.startsWith("kora_review_session=") && /SameSite=Lax/i.test(cookie))).toBe(true);
  // …until the agency removes the invitation.
  expect((await call(`/api/deliverables/1/review-link/invites/${encodeURIComponent(email)}`, { method: "DELETE", person: alice })).status).toBe(200);
  expect((await call(`/api/review/${token}/site/handoff/open`, { body: { ticket } })).status).toBe(400);
});

// ——— The capture of the window ———

test("a request names only a capture its author sent, as an image; the client sees it with the request, and the proof keeps its fingerprint", async () => {
  const { alice, org, token, email } = await siteReview();
  const anchor = { url: "/", selector: "#titre", x: 10, y: 10, viewport: 1400, view: { x: 20, y: 5 } };
  // Nobody verified: no capture.
  expect((await sendCapture({}, token, png)).status).toBe(401);
  const client = await verifiedClient(token, email);
  // Not an image, whatever the type it claims: refused.
  expect((await sendCapture(client, token, makePdf("pas une image"))).status).toBe(400);

  const sent = await sendCapture(client, token, png);
  expect(sent.status).toBe(200);
  const own = sent.json.href!;
  // A file of the agency (an internal capture), or another client's capture: never named by this client.
  const agencyFile = (await upload(alice, png, "interne.png", { kind: "request", projectId: 1, livrableId: 1 })).json.href!;
  const other = `${unique("marc")}@client.test`;
  await call("/api/review-access/invite", { person: alice, body: { linkKey: "1:1", emails: [other] } });
  const otherCapture = (await sendCapture(await verifiedClient(token, other, "Marc Petit"), token, png)).json.href!;
  for (const capture of [agencyFile, otherCapture]) {
    const refused = await clientAction(client, token, "comments", "POST", { message: "Avec un fichier d’autrui", site: { ...anchor, capture } });
    expect(refused.status).toBe(404);
  }
  expect(await sql("select 1 from comments where organization_id = $1 and data->>'message' = 'Avec un fichier d’autrui'", [org])).toHaveLength(0);
  // The client's file stays closed while no request of theirs shows it.
  const readAs = (person: Partial<Person>, href: string) => fetch(`${baseURL}${href}`, { headers: { cookie: person.cookie ?? "", "x-forwarded-for": newIp() }, redirect: "manual" }).then((response) => response.status);
  expect(await readAs(client, agencyFile)).toBe(404);

  const created = await clientAction(client, token, "comments", "POST", { message: "Le titre est trop long", site: { ...anchor, capture: own } });
  expect(created.status).toBe(200);
  expect(await readAs(client, own)).toBe(302);
  expect(await readAs({}, own)).toBe(404);
  const proof = (await call("/api/proof/1", { person: alice })).json as { requests: { message: string; site: { url: string; viewport: number; captureSha256: string | null } | null }[] };
  const [fingerprint] = await sql<{ sha256: string }>("select sha256 from stored_files where organization_id = $1 and id = $2", [org, own.split("/").pop()]);
  expect(proof.requests.find((request) => request.message === "Le titre est trop long")?.site).toEqual({ url: "/", viewport: 1400, captureSha256: fingerprint.sha256 });
});

test("the capture library served to the toolbar is the installed one", async () => {
  const { readFileSync } = await import("node:fs");
  const served = await fetch(`${baseURL}/vendor/modern-screenshot-4.7.0.js`);
  expect(served.status).toBe(200);
  expect(served.headers.get("content-type")).toMatch(/javascript/);
  // A copy of node_modules (public/vendor), its browser build: updating the package means copying it again, under its new version.
  expect(Buffer.from(await served.arrayBuffer()).equals(readFileSync("node_modules/modern-screenshot/dist/index.js"))).toBe(true);
  expect(JSON.parse(readFileSync("node_modules/modern-screenshot/package.json", "utf8")).version).toBe("4.7.0");
});

test("the bar moves where the visitor drops it, stays there, and never under the panel", async ({ browser }) => {
  const { script } = await siteReview();
  const { page, errors } = await siteVisitor(browser, script);
  await page.goto(`${site}/?kora`);
  const pill = page.getByRole("button", { name: "Ouvrir Kora" });
  const start = (await pill.boundingBox())!;

  // A drag moves the bar, without opening Kora.
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(start.x - 300, start.y - 200, { steps: 8 });
  await page.mouse.up();
  const moved = (await pill.boundingBox())!;
  expect(Math.round(start.x - moved.x)).toBeGreaterThan(250);
  expect(Math.round(start.y - moved.y)).toBeGreaterThan(150);
  await expect(page.getByRole("dialog", { name: "Kora", exact: true })).toBeHidden();

  // Remembered on this device: still there at the next visit.
  await page.reload();
  const again = (await page.getByRole("button", { name: "Ouvrir Kora" }).boundingBox())!;
  expect(Math.abs(again.x - moved.x)).toBeLessThan(2);
  expect(Math.abs(again.y - moved.y)).toBeLessThan(2);

  // A click still opens Kora. Dropped where the panel opens, the bar steps to its left.
  await page.getByRole("button", { name: "Ouvrir Kora" }).click();
  await expect(page.getByRole("dialog", { name: "Kora", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Réduire Kora" }).click();
  const folded = (await page.getByRole("button", { name: "Ouvrir Kora" }).boundingBox())!;
  await page.mouse.move(folded.x + folded.width / 2, folded.y + folded.height / 2);
  await page.mouse.down();
  await page.mouse.move(1380, folded.y + folded.height / 2, { steps: 8 });
  await page.mouse.up();
  await page.getByRole("button", { name: "Ouvrir Kora" }).click();
  const beside = (await page.getByRole("toolbar", { name: "Outils Kora" }).boundingBox())!;
  const panel = (await page.getByRole("dialog", { name: "Kora", exact: true }).boundingBox())!;
  expect(beside.x + beside.width).toBeLessThanOrEqual(panel.x);
  expect(errors).toEqual([]);
});

// ——— The line pasted once: the deliverable's fixed key ———

test("the script line is pasted once: its key opens the latest shared version, and says when none is", async ({ browser }) => {
  const { alice, key, script, email } = await siteReview();
  // Version 2 of the same deliverable, shared with the client, with a request of its own placed on the site.
  const v2Token = unique("tok-v2");
  await seedState(alice, {
    lists: {
      deliverables: { upsert: [{ ...siteDeliverable(`${site}/`), id: 2, version: 2 }], remove: [] },
      comments: { upsert: [{ id: 70, deliverableId: 2, author: "Alice Martin", initials: "AM", from: "agency", message: "Titre V2", title: "Titre V2", decision: "Inclus", kind: "request", location: "/", time: "t", site: anchorOn("#titre") }], remove: [] },
    },
    maps: { reviewLinks: { upsert: { "2:2": { token: v2Token, active: true, expiresAt: "01/01/2099", autoExpire: true, deliverableId: 2, version: 2 } }, remove: [] } },
  });
  await call("/api/review-access/invite", { person: alice, body: { linkKey: "2:2", emails: [email] } });
  // The same key for every version.
  expect((await call("/api/deliverables/2/site-key", { person: alice })).json.key).toBe(key);

  // The key leads to the latest shared version's panel, and the token never shows on the site.
  const opened = await call(`/review/site/${encodeURIComponent(key)}?parent=${encodeURIComponent(site)}`);
  expect(opened.status).toBe(307);
  expect(opened.response.headers.get("location")).toBe(`/review/${v2Token}/site?parent=${encodeURIComponent(site)}`);
  const { page, panel } = await siteVisitor(browser, script);
  await page.goto(`${site}/?kora`);
  await verifyInPanel(page, email);
  await expect(page.getByRole("button", { name: "Demande incluse #70" })).toBeVisible();
  expect(await page.content()).not.toContain(v2Token);

  // No version shared any more: the panel says so.
  expect((await call("/api/deliverables/2/review-link", { method: "DELETE", person: alice })).status).toBe(200);
  expect((await call("/api/deliverables/1/review-link", { method: "DELETE", person: alice })).status).toBe(200);
  await page.reload();
  await page.getByRole("button", { name: "Ouvrir Kora" }).click();
  await expect(panel.getByText("Aucune version de ce site n’est partagée pour l’instant.")).toBeVisible();
});

test("a key opens only its own site, as Kora signed it; another agency gets no key", async ({ browser }) => {
  const { alice, key, token } = await siteReview();
  // Framed by the deliverable's site only, like the panel it leads to.
  const framed = await call(`/review/site/${encodeURIComponent(key)}?parent=${encodeURIComponent(site)}`);
  expect(framed.response.headers.get("content-security-policy")).toContain(`frame-ancestors ${site}`);
  expect(framed.response.headers.get("x-frame-options")).toBeNull();
  const elsewhere = await call(`/review/site/${encodeURIComponent(key)}?parent=${encodeURIComponent("https://autre.test")}`);
  expect(elsewhere.status).toBe(200);
  expect(String(elsewhere.json)).toContain("Ce n’est pas le site de ce livrable");
  expect(elsewhere.response.headers.get("content-security-policy")).toContain("frame-ancestors https://autre.test");
  // A key changed by hand: nothing.
  const [payload, signature] = key.split("~");
  const forged = `${Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload, "base64url").toString()), l: 2 })).toString("base64url")}~${signature}`;
  const refused = await call(`/review/site/${encodeURIComponent(forged)}?parent=${encodeURIComponent(site)}`);
  expect(refused.status).toBe(200);
  expect(String(refused.json)).toContain("Cette ligne de script ne mène à aucun livrable");
  // Another agency, or a deliverable that is not a « Lien »: no key.
  const stranger = await signUp("Sam Dehors");
  await createAgency(stranger, "Autre Studio");
  expect((await call("/api/deliverables/1/site-key", { person: stranger })).status).toBe(404);
  await seedState(alice, { lists: { deliverables: { upsert: [{ id: 3, projectId: 1, name: "maquette.png", type: "Image", version: 1, status: "En attente client", importedAt: "x", locked: false }], remove: [] } } });
  expect((await call("/api/deliverables/3/site-key", { person: alice })).status).toBe(404);
  // A line pasted before the key (a version's token) still opens its version.
  const legacy = await siteVisitor(browser, `data-review="${token}"`);
  await legacy.page.goto(`${site}/?kora`);
  await legacy.page.getByRole("button", { name: "Ouvrir Kora" }).click();
  await expect(legacy.panel.getByRole("button", { name: "Recevoir un code" })).toBeVisible();
});

test("the key's panel says why it does not open: a new version not shared yet, a deliverable deleted", async () => {
  const { alice, key } = await siteReview();
  const fresh = "https://nouvelle.northwind.test";
  const at = (origin: string) => `/review/site/${encodeURIComponent(key)}?parent=${encodeURIComponent(origin)}`;
  // A V02 at a new address, not shared yet: the V01 still opens on its site, the V02's site is told to share it.
  await seedState(alice, {
    lists: { deliverables: { upsert: [{ ...siteDeliverable(`${site}/`), status: "Remplacée", locked: true }, { ...siteDeliverable(`${fresh}/`), id: 2, version: 2 }], remove: [] } },
  });
  const unshared = String((await call(at(fresh))).json);
  expect(unshared).toContain("La V02 n’est pas encore partagée");
  expect(unshared).toContain("La version partagée (V01) est à une autre adresse");
  expect(unshared).not.toContain("recette.northwind.test");
  // Shared: the panel opens there.
  await seedState(alice, { maps: { reviewLinks: { upsert: { "2:2": { token: unique("tok-v2"), active: true, expiresAt: "01/01/2099", autoExpire: true, deliverableId: 2, version: 2 } }, remove: [] } } });
  const opened = String((await call(at(fresh))).json);
  expect(opened).not.toContain("pas encore partagée");
  expect(opened).not.toContain("Ce n’est pas le site de ce livrable");
  // The deliverable deleted: its line leads nowhere, and says what to do.
  await seedState(alice, { lists: { deliverables: { upsert: [], remove: [1, 2] } } });
  expect(String((await call(at(fresh))).json)).toContain("Cette ligne de script ne mène à aucun livrable");
});

test("a deliverable's line opens on its own site only: it names no other site of the agency, and no line is the agency's", async () => {
  const { alice, key } = await siteReview();
  const other = "https://autre.northwind.test";
  const otherToken = unique("tok-autre");
  // Another site of the same agency, shared with its client.
  await seedState(alice, {
    lists: { deliverables: { upsert: [{ ...siteDeliverable(`${other}/`), id: 2, name: "Autre site" }], remove: [] } },
    maps: { reviewLinks: { upsert: { "2:1": { token: otherToken, active: true, expiresAt: "01/01/2099", autoExpire: true, deliverableId: 2, version: 1 } }, remove: [] } },
  });
  const otherKey = (await call("/api/deliverables/2/site-key", { person: alice })).json.key as string;
  expect(otherKey).not.toBe(key);
  const at = (line: string, origin: string) => `/review/site/${encodeURIComponent(line)}?parent=${encodeURIComponent(origin)}`;
  // Its own line opens there; the first site's line, read by any visitor of that site, does not lead there.
  expect((await call(at(otherKey, other))).response.headers.get("location")).toContain(otherToken);
  const probed = await call(at(key, other));
  expect(probed.status).toBe(200);
  expect(probed.response.headers.get("location")).toBeNull();
  expect(String(probed.json)).toContain("Ce n’est pas le site de ce livrable");
  expect(String(probed.json)).not.toContain(otherToken);
  expect(String(probed.json)).not.toContain("Autre site");
  // The same answer for an address the agency has no site at: the line tells nothing of the others.
  expect(String((await call(at(key, "https://inconnu.northwind.test"))).json)).toContain("Ce n’est pas le site de ce livrable");
  // There is no line for the whole agency.
  expect((await call("/api/site-key", { person: alice })).status).toBe(404);
});

test("« Nouveau livrable » says what the toolbar of a « Lien » does; its line, the deliverable's, comes once it is created", async ({ browser }) => {
  const { alice } = await siteReview();
  const { page, errors } = await newPerson(browser);
  await signInPage(page, alice.email);
  await page.goto("/projets/1");
  await page.getByRole("button", { name: "Ajouter un livrable", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Nouveau livrable" });
  await dialog.locator(".kind-option").filter({ hasText: /^Lien$/ }).click();
  // The dialog scrolls in a small window, its actions stay in view.
  await page.setViewportSize({ width: 1127, height: 738 });
  const inView = async () => {
    const [frame, button] = [await dialog.boundingBox(), await dialog.getByRole("button", { name: "Créer le livrable" }).boundingBox()];
    return Boolean(frame && button && button.y + button.height <= frame.y + frame.height + 1);
  };
  // The window just shrank: its layout follows, the dialog then scrolls.
  await expect.poll(() => dialog.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  await expect.poll(inView).toBe(true);
  // Said for a first time: an invitation to set it up, where to paste it, where requests then arrive.
  const intro = dialog.getByRole("region", { name: "Recevoir les retours directement depuis le site ?" });
  await expect(intro).toContainText("Juste après la création, Kora vous donne une ligne à coller dans le code du site, avant </body>");
  await expect(intro).toContainText("elle arrivera dans Kora, sur ce livrable, avec une capture");
  await expect(intro).toContainText("Une ligne par site, valable pour toutes ses versions");
  // No line before the deliverable: it is the deliverable's own, given on its board.
  await expect(dialog.getByLabel("Script de recette")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("the invitation of a « Lien » leads to the staging site with the toolbar, and the review page for decisions", async () => {
  const { token, email } = await siteReview();
  const mail = await waitForMail(email, "vous invite");
  expect(mail.text).toContain(`Ouvrir le site de recette : ${site}/?kora`);
  expect(mail.text).toContain(`Les devis et la validation se font sur la page de revue : ${baseURL}/review/${token}?invitation=`);
});

test("the canvas of a « Lien » says how to set the toolbar up: the line with the fixed key and the client's address", async ({ browser }) => {
  // The deliverable's line: one per site, for all its versions.
  const { alice, key } = await siteReview();
  const { page, errors } = await newPerson(browser);
  await signInPage(page, alice.email);
  await page.goto("/projets/1/livrables/1");
  // No request yet: the setup is open on the board, as three steps, beside the toolbar at work.
  const board = page.getByRole("region", { name: "Tableau de recette" });
  await expect(board.getByText("Paramétrer la barre Kora")).toBeVisible();
  await expect(board.getByRole("img", { name: /Avec la barre Kora, on clique sur un élément du site/ })).toBeVisible();
  for (const step of ["Installez la barre Kora", "Invitez le décideur", "Qualifiez ses demandes"]) await expect(board.getByRole("heading", { name: step, exact: true })).toBeVisible();
  // The last step teaches what each qualification means.
  await expect(board.getByRole("listitem").filter({ hasText: "Qualifiez ses demandes" })).toContainText("Hors scope si elle est à chiffrer");
  // The long script line wraps in its field: the board never scrolls sideways, « Ouvrir le site » stays in view.
  await expect.poll(() => board.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(0);
  await expect(board.getByRole("link", { name: "Ouvrir le site" })).toBeInViewport();
  await expect(board.getByLabel("Script de recette")).toHaveValue(`<script src="${baseURL}/kora-toolbar.js" data-site="${key}" defer></script>`);
  await expect(board.getByLabel("Lien du site pour le décideur")).toHaveValue(`${site}/?kora`);
  // « Partager la revue » is about people only.
  await page.getByRole("button", { name: "Partager la revue" }).first().click();
  await expect(page.getByRole("dialog", { name: "Partager la revue" }).getByLabel("Script de recette")).toHaveCount(0);
  expect(errors).toEqual([]);
});

// ——— The board of a « Lien » in Kora ———

test("in Kora, a « Lien » shows each request as a page of the canvas, its capture with its pin, for the agency and the client", async ({ browser }) => {
  const { alice, token, email } = await siteReview();
  const shot = (await upload(alice, png, "capture.png", { kind: "request", projectId: 1, livrableId: 1 })).json.href!;
  const at = (url: string, selector: string) => ({ url, selector, x: 10, y: 10, viewport: 1400, view: { x: 30, y: 40 }, capture: shot });
  await seedState(alice, {
    lists: {
      comments: {
        upsert: [
          { id: 80, deliverableId: 1, author: "Claire Dubois", initials: "CD", from: "client", message: "Le titre est trop long", decision: "À qualifier", kind: "remark", location: "/", time: "t", site: at("/", "#titre") },
          { id: 81, deliverableId: 1, author: "Alice Martin", initials: "AM", from: "agency", message: "Bouton vert", title: "Bouton vert", decision: "Inclus", kind: "request", location: "/", time: "t", site: at("/", "button") },
          { id: 82, deliverableId: 1, author: "Claire Dubois", initials: "CD", from: "client", message: "Ajouter un plan d’accès", decision: "À qualifier", kind: "remark", location: "/contact", time: "t", site: at("/contact", "form") },
          // Internal: a pin of the agency without a status, never shown to the client.
          { id: 83, deliverableId: 1, author: "Alice Martin", initials: "AM", from: "agency", message: "Vérifier les marges", decision: "À qualifier", kind: "remark", internalNote: true, location: "/contact", time: "t", site: at("/contact", "h1") },
        ],
        remove: [],
      },
    },
  });

  // The agency: every request, under its page of the site, as a page of the canvas: its capture, its pin
  // where the click was on it, which opens its thread.
  const agency = await newPerson(browser);
  await signInPage(agency.page, alice.email);
  await agency.page.goto("/projets/1/livrables/1");
  const board = agency.page.getByRole("region", { name: "Tableau de recette" });
  await expect(board.getByRole("heading", { name: "recette.northwind.test" })).toBeVisible();
  await expect(board.getByRole("region", { name: "Page /", exact: true }).getByRole("button")).toHaveCount(2);
  await expect(board.getByRole("region", { name: "Page /contact" }).getByRole("button")).toHaveCount(2);
  await expect(board.getByRole("region", { name: "Page /contact" }).getByRole("img", { name: "Capture de /contact" })).toHaveCount(2);
  const pin = board.getByRole("button", { name: "Commentaire #82" });
  await expect(pin).toBeVisible();
  expect(await pin.evaluate((element) => [element.style.left, element.style.top])).toEqual(["30%", "40%"]);
  // The canvas keeps its bottom bar: the hand, the agency's pins (the decider comments on the site), the zoom.
  const tools = board.getByRole("toolbar", { name: "Outils du canevas" });
  await expect(tools.getByRole("button", { name: "Main" })).toBeVisible();
  await expect(tools.getByRole("button", { name: "Commentaire", exact: true })).toBeVisible();
  await expect(tools.getByRole("button", { name: "Augmenter le zoom" })).toBeVisible();
  // The client's comments are in the requests panel too, to clarify.
  await expect(agency.page.getByRole("complementary", { name: "Demandes" })).toContainText("Le titre est trop long");
  await expect(board.getByRole("link", { name: "Ouvrir le site" })).toHaveAttribute("href", `${site}/?kora`);
  // The same link is copied from the site's address, to paste or send.
  await agency.page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await board.getByRole("button", { name: "Copier le lien du site" }).click();
  await expect(board.getByRole("button", { name: "Copier le lien du site" })).toContainText("Lien copié");
  expect(await agency.page.evaluate(() => navigator.clipboard.readText())).toBe(`${site}/?kora`);
  // Each page opens on the site, with the toolbar.
  await expect(board.getByRole("region", { name: "Page /contact" }).getByRole("link", { name: "Ouvrir la page" })).toHaveAttribute("href", `${site}/contact?kora`);
  // Requests came: the setup is folded under its title.
  await expect(board.getByText("Paramétrer la barre Kora")).toBeVisible();
  await expect(board.getByLabel("Script de recette")).toBeHidden();
  await board.getByRole("button", { name: "Commentaire #82" }).click();
  await expect(agency.page.getByRole("dialog", { name: "Commentaire #82" })).toContainText("Ajouter un plan d’accès");
  expect(agency.errors).toEqual([]);

  // The client: what they may see only.
  const client = await verifiedClient(token, email);
  const { page, errors } = await newPerson(browser);
  const [name, value] = client.cookie.split(";")[0].split("=");
  await page.context().addCookies([{ name, value, url: baseURL }]);
  await page.goto(`/review/${token}`);
  const clientBoard = page.getByRole("region", { name: "Tableau de recette" });
  await expect(clientBoard.getByRole("region", { name: "Page /contact" }).getByRole("button")).toHaveCount(1);
  await expect(clientBoard.getByText("Vérifier les marges")).toHaveCount(0);
  // The toolbar's setup is the agency's: never on the client's page.
  await expect(clientBoard.getByText("Paramétrer la barre Kora")).toHaveCount(0);
  await expect(page.getByLabel("Script de recette")).toHaveCount(0);
  // The decider copies the site's link too.
  await expect(clientBoard.getByRole("button", { name: "Copier le lien du site" })).toBeVisible();
  // The decider's pins are placed on the site: their canvas has the hand only.
  await expect(clientBoard.getByRole("toolbar", { name: "Outils du canevas" }).getByRole("button", { name: "Commentaire", exact: true })).toHaveCount(0);
  // Their own steps, nothing to set up: always in view.
  await expect(clientBoard.getByRole("heading", { name: "Commentez le site avec la barre Kora" })).toBeVisible();
  await expect(clientBoard.getByRole("heading", { name: "Cliquez sur « Kora »" })).toBeVisible();
  // Kora runs on this computer here: the browser will ask before showing the toolbar, and they are told what to answer.
  await expect(clientBoard.getByRole("listitem").filter({ hasText: "Cliquez sur « Kora »" })).toContainText("votre navigateur peut demander l’autorisation d’accéder au réseau local");
  // The capture of a request they see opens for them (/api/files).
  const capture = clientBoard.getByRole("region", { name: "Page /contact" }).getByRole("img", { name: "Capture de /contact" });
  await expect.poll(() => capture.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test("a new version of a « Lien » is a new address of the site, asked for in Kora, not a file", async ({ browser }) => {
  const { alice, org } = await siteReview();
  const { page, errors } = await newPerson(browser);
  await signInPage(page, alice.email);
  await page.goto("/projets/1/livrables/1");
  const versions = page.getByRole("region", { name: "Versions" });
  await expect(versions.locator('input[type="file"]')).toHaveCount(0);
  await versions.getByRole("button", { name: "Nouvelle version du site" }).click();
  const dialog = page.getByRole("dialog", { name: "Nouvelle version du site" });
  // The address of the current version, to change: an address that is not a web page is refused.
  const field = dialog.getByLabel("Adresse du site");
  await expect(field).toHaveValue(`${site}/`);
  await field.fill("recette");
  await dialog.getByRole("button", { name: "Créer la version" }).click();
  await expect(dialog.getByRole("alert")).toContainText("https://");
  // A site on this computer, or in http: the client could not review it, it has to be deployed first.
  await field.fill("http://localhost:5173/");
  await dialog.getByRole("button", { name: "Créer la version" }).click();
  await expect(dialog.getByRole("alert")).toContainText("n’existe que sur votre ordinateur");
  await field.fill("http://recette.northwind.test/");
  await dialog.getByRole("button", { name: "Créer la version" }).click();
  await expect(dialog.getByRole("alert")).toContainText("Le site doit être en https://");
  await field.fill(`${site}/v2/`);
  await dialog.getByRole("button", { name: "Créer la version" }).click();
  // As for a file: the people of the V01 are offered the V02.
  await expect(page.getByRole("heading", { name: "Partager la V02 ?" })).toBeVisible();
  await page.getByRole("button", { name: "Plus tard" }).click();
  await expect
    .poll(async () => (await sql<{ data: Record<string, unknown> }>("select data from deliverables where organization_id = $1 and version = 2", [org]))[0]?.data)
    .toMatchObject({ type: "Link", url: `${site}/v2/`, name: "Site de recette" });
  await expect(page.getByRole("region", { name: "Tableau de recette" }).getByRole("link", { name: "Ouvrir le site" })).toHaveAttribute("href", `${site}/v2/?kora`);
  // The menus ask for an address too.
  await page.getByRole("button", { name: "Menu principal" }).first().click();
  await page.getByRole("menuitem", { name: /Nouvelle version/ }).click();
  await expect(page.getByRole("dialog", { name: "Nouvelle version du site" }).getByLabel("Adresse du site")).toHaveValue(`${site}/v2/`);
  expect(errors).toEqual([]);
});

test("a new « Lien » must be a deployed site: the form refuses an address of this computer or in http", async ({ browser }) => {
  const { alice, org } = await siteReview();
  const { page, errors } = await newPerson(browser);
  await signInPage(page, alice.email);
  await page.goto("/projets/1");
  await page.getByRole("button", { name: "Ajouter un livrable", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Nouveau livrable" });
  await dialog.getByLabel("Nom du livrable").fill("Portfolio");
  // The kind is picked by its label (its radio is drawn by the label).
  await dialog.locator(".kind-option").filter({ hasText: /^Lien$/ }).click();
  await expect(dialog.getByRole("radio", { name: "Lien" })).toBeChecked();
  const field = dialog.getByLabel("Adresse de la page");
  const create = dialog.getByRole("button", { name: "Créer le livrable" });
  await field.fill("http://localhost:5173/");
  await create.click();
  await expect(dialog.getByRole("alert")).toContainText("Déployez le site, ou donnez l’adresse de sa preview");
  await field.fill("http://portfolio.northwind.test/");
  await create.click();
  await expect(dialog.getByRole("alert")).toContainText("Le site doit être en https://");
  await field.fill("https://portfolio.northwind.test/");
  await create.click();
  await page.waitForURL(/livrables\/\d+/);
  await expect
    .poll(async () => (await sql<{ data: Record<string, unknown> }>("select data from deliverables where organization_id = $1 and data->>'name' = 'Portfolio'", [org]))[0]?.data)
    .toMatchObject({ type: "Link", url: "https://portfolio.northwind.test/" });
  expect(errors).toEqual([]);
});

test("on a « Lien »'s canvas, the agency pins a comment on a request's capture: its draft, tied to that request", async ({ browser }) => {
  const { alice, org, token, email } = await siteReview();
  const shot = (await upload(alice, png, "capture.png", { kind: "request", projectId: 1, livrableId: 1 })).json.href!;
  const at = (url: string, selector: string) => ({ url, selector, x: 10, y: 10, viewport: 1400, view: { x: 30, y: 40 }, capture: shot });
  await seedState(alice, {
    lists: {
      comments: {
        upsert: [
          { id: 82, deliverableId: 1, author: "Claire Dubois", initials: "CD", from: "client", message: "Ajouter un plan d’accès", decision: "À qualifier", kind: "remark", location: "/contact", time: "t", site: at("/contact", "form") },
          // The agency's draft on the site, never shown to the client.
          { id: 83, deliverableId: 1, author: "Alice Martin", initials: "AM", from: "agency", message: "Vérifier les marges", decision: "À qualifier", kind: "remark", internalNote: true, location: "/contact", time: "t", site: at("/contact", "h1") },
          // Out of the site: a pin cannot be tied to it.
          { id: 90, deliverableId: 1, author: "Alice Martin", initials: "AM", from: "agency", message: "Reçue par e-mail", title: "Reçue par e-mail", decision: "Inclus", kind: "request", location: "Livrable (général)", time: "t" },
        ],
        remove: [],
      },
    },
  });
  const { page, errors } = await newPerson(browser);
  await signInPage(page, alice.email);
  await page.goto("/projets/1/livrables/1");
  const board = page.getByRole("region", { name: "Tableau de recette" });
  await board.getByRole("toolbar", { name: "Outils du canevas" }).getByRole("button", { name: "Commentaire", exact: true }).click();
  const contact = board.getByRole("region", { name: "Page /contact" });
  // A click on the capture's page (the comment tool takes the page, as on a PDF's).
  await contact.locator("[data-page]").first().click({ position: { x: 60, y: 40 } });
  await page.getByRole("textbox", { name: "Commentaire" }).fill("Bouton trop petit");
  await page.getByRole("button", { name: "Publier" }).click();
  const pinned = async () => (await sql<{ data: Record<string, unknown> }>("select data from comments where organization_id = $1 and data->>'message' = 'Bouton trop petit'", [org]))[0]?.data;
  await expect.poll(pinned).toMatchObject({ from: "agency", internalNote: true, pinnedOn: 82 });
  // Its pin on that capture, under the page of the site.
  const own = contact.getByRole("button", { name: /Bouton trop petit/ });
  await expect(own).toBeVisible();
  // It moves on its capture, as any pin of the agency; the decider's, placed on the site, stays where it was clicked.
  // (Its thread opened once published: closed first, as the agency would, so that it covers no pin.)
  const thread = page.getByRole("dialog", { name: /^Commentaire #/ });
  await expect(thread).toBeVisible();
  // Published: the panel turns to the agency's drafts as the thread opens. Closed only then, so that the
  // end of the publishing does not open it again (and glide the canvas) under the drag.
  await expect(page.getByRole("complementary", { name: "Demandes" }).getByRole("tab", { name: /^Mes brouillons/ })).toHaveAttribute("aria-selected", "true");
  await thread.getByRole("button", { name: "Fermer" }).click();
  await expect(thread).toHaveCount(0);
  const before = (await pinned())!.position as { x: number; y: number };
  // The canvas glides to an opened thread: the pin is taken once it stands still, not on its way.
  const steady = async (pin: typeof own) => {
    let last = "";
    await expect
      .poll(async () => {
        const now = JSON.stringify(await pin.boundingBox());
        const still = now === last;
        last = now;
        return still;
      })
      .toBe(true);
    return (await pin.boundingBox())!;
  };
  const drag = async (pin: typeof own, dx: number) => {
    const box = await steady(pin);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2 + 20, { steps: 8 });
    await page.mouse.up();
  };
  await drag(own, 60);
  await expect.poll(async () => ((await pinned())!.position as { x: number }).x).toBeGreaterThan(before.x);
  const decider = contact.getByRole("button", { name: /Commentaire #82/ });
  const placed = await steady(decider);
  await drag(decider, 60);
  await expect.poll(async () => Math.round((await decider.boundingBox())!.x)).toBe(Math.round(placed.x));
  expect((await sql<{ data: Record<string, unknown> }>("select data from comments where organization_id = $1 and id = 82", [org]))[0].data.position).toBeUndefined();
  expect(errors).toEqual([]);

  // The server ties a pin only to a request placed on the site, of this version.
  const pin = (pinnedOn: number) => call("/api/comments", { method: "POST", person: alice, body: { deliverableId: 1, message: "Ici", page: 1, position: { x: 5, y: 5 }, pinnedOn } });
  expect((await pin(90)).status).toBe(404);
  expect((await pin(999)).status).toBe(404);

  // Qualified, a pin shows to the client; tied to a request they do not see, it does not say which.
  await seedState(alice, {
    lists: {
      comments: {
        upsert: [
          { id: 84, deliverableId: 1, author: "Alice Martin", initials: "AM", from: "agency", message: "Sur le plan", title: "Sur le plan", decision: "Inclus", kind: "request", location: "/contact", time: "t", pinnedOn: 82, position: { x: 50, y: 50 } },
          { id: 85, deliverableId: 1, author: "Alice Martin", initials: "AM", from: "agency", message: "Sur les marges", title: "Sur les marges", decision: "Inclus", kind: "request", location: "/contact", time: "t", pinnedOn: 83, position: { x: 50, y: 50 } },
        ],
        remove: [],
      },
    },
  });
  const client = await verifiedClient(token, email);
  const seen = ((await (await fetch(`${baseURL}/api/review/${token}`, { headers: { cookie: client.cookie.split(";")[0] } })).json()) as { state: { comments: Record<string, unknown>[] } }).state.comments;
  expect(seen.find((comment) => comment.id === 84)).toMatchObject({ pinnedOn: 82 });
  expect(seen.find((comment) => comment.id === 85)).not.toHaveProperty("pinnedOn");
  expect(seen.find((comment) => comment.id === 83)).toBeUndefined();
});

test("a « Lien » with no decider yet says so at the top of its canvas, as any deliverable", async ({ browser }) => {
  const alice = await signUp("Alice Martin");
  await createAgency(alice, "Studio Partage");
  await seedState(alice, {
    lists: {
      clients: { upsert: [{ id: 1, name: "Northwind" }], remove: [] },
      projects: { upsert: [{ id: 1, name: "Refonte", clientId: 1, client: "Northwind", status: "En cours" }], remove: [] },
      deliverables: { upsert: [siteDeliverable(`${site}/`)], remove: [] },
    },
  });
  const { page, errors } = await newPerson(browser);
  await signInPage(page, alice.email);
  await page.goto("/projets/1/livrables/1");
  const canvas = page.getByRole("region", { name: "Tableau de recette" });
  const alert = canvas.getByRole("status").filter({ hasText: "Aucun décideur sur cette version" });
  await expect(alert).toBeVisible();
  // It covers nothing: the sheet starts under it, « Ouvrir le site » in view.
  await expect
    .poll(async () => (await alert.boundingBox())!.y + (await alert.boundingBox())!.height <= (await canvas.getByRole("link", { name: "Ouvrir le site" }).boundingBox())!.y)
    .toBe(true);
  // Not in the guide any more: the alert is the canvas's.
  await expect(canvas.locator(".site-guide").getByText("pas encore partagée")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("a « Lien » without requests says how they come", async ({ browser }) => {
  const { alice } = await siteReview();
  const { page, errors } = await newPerson(browser);
  await signInPage(page, alice.email);
  await page.goto("/projets/1/livrables/1");
  const board = page.getByRole("region", { name: "Tableau de recette" });
  await expect(board.getByText("Aucune demande sur le site pour l’instant.")).toBeVisible();
  // Said once, under « Demandes reçues », not again in the site's bar.
  await expect(board.getByText("Aucune demande pour l’instant")).toHaveCount(0);
  expect(errors).toEqual([]);
});
