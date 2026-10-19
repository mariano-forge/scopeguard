// The Kora toolbar on an agency's staging site (US-048, public/kora-toolbar.js): the client verifies
// their address in Kora's panel, framed on the site, and places requests on its elements. The panel
// opens on the deliverable's own site only, and the site's page never holds what the client wrote.
// The staging site is served by the test itself, on another origin than Kora.

import { expect, test, type Browser, type Page } from "@playwright/test";
import { baseURL } from "../../playwright.config";
import { addColleague, call, clientAction, makePdf, upload, createAgency, headers, newIp, newPerson, seedState, signInPage, signUp, sql, unique, verifiedClient, waitForCode, waitForMail, type Member, type Person } from "./helpers";

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
  await expect(panel.getByRole("heading", { name: "Demandes", exact: true })).toBeVisible();
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

  // Kora's two tools on the floating bar: « Naviguer » by default, « Commenter » until Escape (or V).
  const browse = page.getByRole("button", { name: "Naviguer" });
  const comment = page.getByRole("button", { name: "Commenter" });
  await expect(browse).toHaveAttribute("aria-pressed", "true");
  await comment.click();
  await expect(comment).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("status").filter({ hasText: "Cliquez sur un élément de la page" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(browse).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("c");
  await expect(comment).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("heading", { name: "Bienvenue chez Northwind" }).click({ position: { x: 20, y: 10 } });
  await expect(panel.getByText("h1 « Bienvenue chez Northwind »")).toBeVisible();
  const message = "Le titre doit tenir sur une ligne";
  await panel.getByLabel("Votre demande").fill(message);
  await panel.getByRole("button", { name: "Envoyer" }).click();

  // Stored as a request of the client, signed by the server, with where it was placed.
  await expect.poll(async () => (await siteRequests(org)).length).toBe(1);
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
  // …and shown in the panel's thread, read through the panel's session.
  const shot = panel.getByRole("img", { name: "Capture de la page / au moment de la demande" });
  await expect(shot).toBeVisible();
  await expect.poll(() => shot.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
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
  await expect(page.getByRole("dialog", { name: "Kora" })).toBeHidden();
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
  expect(String(elsewhere.json)).toContain("ne s’ouvre que sur le site de la revue");
  expect(String(elsewhere.json)).not.toContain("Recevoir un code");

  // A staging site in http (but on this computer): a page anyone on the way could rewrite frames nothing.
  await seedState(alice, { lists: { deliverables: { upsert: [siteDeliverable("http://recette.northwind.test/")], remove: [] } } });
  const unsecured = await call(`/review/${token}/site?parent=${encodeURIComponent("http://recette.northwind.test")}`);
  expect(String(unsecured.json)).toContain("ne s’ouvre que sur le site de la revue");
  await seedState(alice, { lists: { deliverables: { upsert: [siteDeliverable(`${site}/`)], remove: [] } } });

  // The toolbar copied onto another site: the panel refuses to open there.
  const other = await siteVisitor(browser, script, "https://autre.test");
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
  // In the panel, Kora's « Demandes »: both included requests under « Inclus ».
  await panel.getByRole("tab", { name: /^Inclus/ }).click();
  await expect(panel.getByRole("tabpanel").getByRole("button")).toHaveCount(2);
  await panel.getByRole("button", { name: "Demande incluse #22" }).click();
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

// ——— The agency in the panel ———

const anchorOn = (selector: string) => ({ url: "/", selector, x: 10, y: 50, viewport: 1400 });

/** The panel's agency session of `member`, through the ticket of the Kora window, as a cookie. */
async function siteAgencySession(member: Member, token: string): Promise<Person> {
  const ticket = await call(`/api/review/${token}/site/ticket`, { person: member, body: {} });
  expect(ticket.status).toBe(200);
  const ip = newIp();
  const opened = await fetch(`${baseURL}/api/review/${token}/site/session`, { method: "POST", headers: headers({ ip }), body: JSON.stringify({ ticket: ticket.json.ticket }) });
  expect(opened.status).toBe(200);
  return { cookie: opened.headers.getSetCookie().map((cookie) => cookie.split(";")[0]).join("; "), ip };
}

test("an agency member is recognised in the panel by a Kora window, then annotates and qualifies on the site", async ({ browser }) => {
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
  // Signed in to Kora in this browser, as the member would be in another tab.
  await page.context().addCookies(alice.cookie.split("; ").map((pair) => ({ name: pair.split("=")[0], value: pair.slice(pair.indexOf("=") + 1), url: baseURL })));
  await page.goto(`${site}/?kora`);
  await page.getByRole("button", { name: "Ouvrir Kora" }).click();
  const popup = page.waitForEvent("popup");
  await panel.getByRole("button", { name: "Je suis de l’agence" }).click();
  const window = await popup;
  const closed = window.waitForEvent("close");
  await window.getByRole("button", { name: "Continuer en tant que Alice Martin" }).click();
  await closed;
  await expect(panel.getByText("Agence : Alice Martin")).toBeVisible();

  // The agency sees its draft pin too, Kora's blue one, as in Kora.
  await expect(page.getByRole("button", { name: "Commentaire #30" })).not.toHaveClass(/is-agency/);
  await expect(page.getByRole("button", { name: "Commentaire #31" })).toHaveClass(/is-agency/);
  await panel.getByRole("button", { name: "Commentaire #31" }).click();
  await expect(panel.getByRole("dialog", { name: /#31$/ })).toBeVisible();
  await panel.getByRole("button", { name: "Demandes", exact: true }).click();

  // A remark of its own on the site: an internal pin, as in Kora.
  await page.getByRole("button", { name: "Commenter" }).click();
  await page.getByRole("heading", { name: "Bienvenue chez Northwind" }).click({ position: { x: 40, y: 10 } });
  await panel.getByLabel("Votre remarque").fill("Vérifier le contraste du titre");
  await panel.getByRole("button", { name: "Envoyer" }).click();
  // (The capture of the page is sent first: it takes longer on a loaded machine.)
  await expect
    .poll(async () => (await sql<{ data: Record<string, unknown> }>("select data from comments where organization_id = $1 and data->>'message' = 'Vérifier le contraste du titre'", [org]))[0]?.data, { timeout: 30_000 })
    .toMatchObject({ from: "agency", author: "Alice Martin", internalNote: true, location: "/", decision: "À qualifier", site: { url: "/", selector: "#titre" } });

  // The client's request, qualified from the site.
  await panel.getByRole("button", { name: "Demandes", exact: true }).click();
  await panel.getByRole("tabpanel").getByRole("button", { name: "Commentaire #30" }).click();
  await panel.getByRole("button", { name: "Créer une demande" }).click();
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

  const waiting = panel.getByRole("status").filter({ hasText: "1 devis attend votre décision." });
  await expect(waiting).toBeVisible();
  const opened = page.context().waitForEvent("page");
  await waiting.getByRole("button", { name: "Ouvrir dans Kora" }).click();
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
  await expect(page.getByRole("dialog", { name: "Kora" })).toBeHidden();

  // Remembered on this device: still there at the next visit.
  await page.reload();
  const again = (await page.getByRole("button", { name: "Ouvrir Kora" }).boundingBox())!;
  expect(Math.abs(again.x - moved.x)).toBeLessThan(2);
  expect(Math.abs(again.y - moved.y)).toBeLessThan(2);

  // A click still opens Kora. Dropped where the panel opens, the bar steps to its left.
  await page.getByRole("button", { name: "Ouvrir Kora" }).click();
  await expect(page.getByRole("dialog", { name: "Kora" })).toBeVisible();
  await page.getByRole("button", { name: "Réduire Kora" }).click();
  const folded = (await page.getByRole("button", { name: "Ouvrir Kora" }).boundingBox())!;
  await page.mouse.move(folded.x + folded.width / 2, folded.y + folded.height / 2);
  await page.mouse.down();
  await page.mouse.move(1380, folded.y + folded.height / 2, { steps: 8 });
  await page.mouse.up();
  await page.getByRole("button", { name: "Ouvrir Kora" }).click();
  const beside = (await page.getByRole("toolbar", { name: "Outils Kora" }).boundingBox())!;
  const panel = (await page.getByRole("dialog", { name: "Kora" }).boundingBox())!;
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
  expect(String(elsewhere.json)).toContain("ne s’ouvre que sur le site de la revue");
  expect(elsewhere.response.headers.get("content-security-policy")).toContain("frame-ancestors https://autre.test");
  // A key changed by hand: nothing.
  const [payload, signature] = key.split("~");
  const forged = `${Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload, "base64url").toString()), l: 2 })).toString("base64url")}~${signature}`;
  const refused = await call(`/review/site/${encodeURIComponent(forged)}?parent=${encodeURIComponent(site)}`);
  expect(refused.status).toBe(200);
  expect(String(refused.json)).toContain("ne s’ouvre que sur le site de la revue");
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

test("the invitation of a « Lien » leads to the staging site with the toolbar, and the review page for decisions", async () => {
  const { token, email } = await siteReview();
  const mail = await waitForMail(email, "vous invite");
  expect(mail.text).toContain(`Ouvrir le site de recette : ${site}/?kora`);
  expect(mail.text).toContain(`Les devis et la validation se font sur la page de revue : ${baseURL}/review/${token}?invitation=`);
});

test("« Partager la revue » of a « Lien » gives the line with the fixed key and the client's address", async ({ browser }) => {
  const { alice, key } = await siteReview();
  const { page, errors } = await newPerson(browser);
  await signInPage(page, alice.email);
  await page.goto("/projets/1/livrables/1");
  await page.getByRole("button", { name: "Partager la revue" }).first().click();
  await expect(page.getByLabel("Script de recette")).toHaveValue(`<script src="${baseURL}/kora-toolbar.js" data-site="${key}" defer></script>`);
  await expect(page.getByLabel("Lien du site pour le client")).toHaveValue(`${site}/?kora`);
  expect(errors).toEqual([]);
});

// ——— The board of a « Lien » in Kora ———

test("in Kora, a « Lien » shows its requests page by page with their captures, for the agency and the client", async ({ browser }) => {
  const { alice, token, email } = await siteReview();
  const shot = (await upload(alice, png, "capture.png", { kind: "request", projectId: 1, livrableId: 1 })).json.href!;
  const at = (url: string, selector: string) => ({ url, selector, x: 10, y: 10, viewport: 1400, capture: shot });
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

  // The agency: every request, page by page, each card opening its thread.
  const agency = await newPerson(browser);
  await signInPage(agency.page, alice.email);
  await agency.page.goto("/projets/1/livrables/1");
  const board = agency.page.getByRole("region", { name: "Tableau de recette" });
  await expect(board.getByRole("heading", { name: "recette.northwind.test" })).toBeVisible();
  await expect(board.getByRole("region", { name: "Page /", exact: true }).getByRole("button")).toHaveCount(2);
  await expect(board.getByRole("region", { name: "Page /contact" }).getByRole("button")).toHaveCount(2);
  await expect(board.getByRole("link", { name: "Ouvrir le site" })).toHaveAttribute("href", `${site}/?kora`);
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
  // The capture of a request they see opens for them (/api/files).
  const card = clientBoard.getByRole("button", { name: "Commentaire #82" }).locator("img");
  await expect.poll(() => card.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test("a « Lien » without requests says how they come", async ({ browser }) => {
  const { alice } = await siteReview();
  const { page, errors } = await newPerson(browser);
  await signInPage(page, alice.email);
  await page.goto("/projets/1/livrables/1");
  await expect(page.getByRole("region", { name: "Tableau de recette" }).getByText("Aucune demande sur le site pour l’instant.")).toBeVisible();
  expect(errors).toEqual([]);
});
