// « Demandes », a project's requests as a board (src/app/(agency)/ProjectRequests.tsx, requestBoard.ts): each
// request in the column of where it stands, from the agency's draft to the proposal accepted, filtered by
// deliverable, each card opening its request; the board as tall as the window, each column scrolling on its
// own. An accepted proposal is marked paid by an administrator only, written in the journal, never shown to
// the client (the server's rule; not on the board for now).

import { expect, test, type Page } from "@playwright/test";
import { addColleague, call, createAgency, newPerson, seedState, signInPage, signUp, sql, unique, verifiedClient } from "./helpers";

const request = (id: number, title: string, decision: string, extra: Record<string, unknown> = {}) => ({
  id, deliverableId: 1, author: "Claire Dubois", initials: "CD", from: "client", kind: "request", message: title, title, decision, location: "", time: "t", createdAt: id, ...extra,
});
const quote = (id: number, commentId: number, status: string) => ({ id, commentId, version: 1, amount: 900, deadline: 3, status, createdAt: "x", description: "Devis" });

/** Two deliverables, a request at each stage of the board. */
async function projectWithRequests() {
  const alice = await signUp("Alice Martin");
  await createAgency(alice, "Studio Tableau");
  const token = unique("tok-board");
  await seedState(alice, {
    lists: {
      clients: { upsert: [{ id: 1, name: "Northwind" }], remove: [] },
      projects: { upsert: [{ id: 1, name: "Refonte", clientId: 1, client: "Northwind", status: "En cours" }], remove: [] },
      deliverables: {
        upsert: [
          { id: 1, projectId: 1, name: "maquette.pdf", type: "PDF", version: 1, status: "En attente client", locked: false, importedAt: "14/10/2026" },
          { id: 2, projectId: 1, name: "logo.png", type: "Image", version: 1, status: "En attente client", locked: false, importedAt: "15/10/2026" },
        ],
        remove: [],
      },
      comments: {
        upsert: [
          // The agency's pin, not qualified yet: its draft.
          { id: 50, deliverableId: 1, author: "Alice Martin", initials: "AM", from: "agency", kind: "remark", message: "Vérifier les marges", decision: "À qualifier", location: "", time: "t", createdAt: 50 },
          request(51, "Quelle police ?", "À qualifier"),
          request(52, "Agrandir le titre", "Inclus"),
          request(53, "Page FAQ", "Hors périmètre"),
          request(54, "Version anglaise", "Hors périmètre"),
          request(55, "Blog", "Hors périmètre"),
          request(56, "Newsletter", "Hors périmètre"),
          request(57, "Page Équipe", "Hors périmètre"),
          request(58, "Animation du logo", "Hors périmètre", { offer: { amount: 300, days: 0, sentAt: 1, sentBy: "Alice Martin" } }),
          request(59, "Espace membre", "Hors périmètre"),
          request(60, "Couleur du logo", "Inclus", { deliverableId: 2, closed: true, closedAt: 1 }),
        ],
        remove: [],
      },
    },
    maps: {
      reviewLinks: { upsert: { "1:1": { token, active: true, expiresAt: "01/01/2099", autoExpire: true, deliverableId: 1, version: 1 } }, remove: [] },
      proposalStates: { upsert: { "54": "draft", "55": "sent", "56": "sent", "57": "sent", "59": "sent" }, remove: [] },
      proposalVersions: {
        upsert: { "54": [quote(540, 54, "draft")], "55": [quote(550, 55, "sent")], "56": [quote(560, 56, "sent")], "57": [quote(570, 57, "accepted")], "59": [quote(590, 59, "refused")] },
        remove: [],
      },
      proposalDecisions: { upsert: { "57": "accepted", "59": "refused" }, remove: [] },
      adaptationRequests: { upsert: { "56": { message: "Moins cher ?", budget: 600, requestedAt: "x" } }, remove: [] },
    },
  });
  return { alice, org: alice.organizationId!, token };
}

const board = (page: Page) => page.getByRole("region", { name: "Pipeline des demandes" });
const column = (page: Page, name: string) => board(page).getByRole("region", { name, exact: true });
const eventsOf = async (org: string, type: string) =>
  (await sql<{ description: string }>("select data->>'description' as description from audit_events where organization_id = $1 and type = $2 order by id", [org, type])).map((row) => row.description);
const paidAtOf = async (org: string, id: number) =>
  (await sql<{ paid: string | null }>("select data->>'paidAt' as paid from comments where organization_id = $1 and id = $2", [org, id]))[0]?.paid ?? null;

test("« Demandes » shows each request in the column of where it stands, filtered by deliverable, each opening its own", async ({ browser }) => {
  const { alice } = await projectWithRequests();
  const { page, errors } = await newPerson(browser);
  await signInPage(page, alice.email);
  await page.goto("/projets/1");
  await page.getByRole("navigation", { name: "Sections du projet" }).getByRole("link", { name: "Demandes" }).click();
  await expect(page).toHaveURL(/\/projets\/1\/demandes$/);
  // « Ajouter un livrable » on every tab of the project, its dialog in this project.
  for (const tab of ["Périmètre", "Suivi", "Demandes"]) {
    await page.getByRole("navigation", { name: "Sections du projet" }).getByRole("link", { name: tab }).click();
    await expect(page.getByRole("button", { name: "Ajouter un livrable" })).toBeVisible();
  }
  await page.getByRole("button", { name: "Ajouter un livrable" }).click();
  await expect(page.getByRole("dialog", { name: "Nouveau livrable" })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Nouveau livrable" }).getByLabel("Projet")).toHaveCount(0);
  await page.keyboard.press("Escape");

  // Ten columns, from the draft to the closed ones.
  await expect(board(page).getByRole("heading", { level: 2 })).toHaveText([
    "Brouillon", "À clarifier", "Inclus", "Hors scope à chiffrer", "Chiffrée", "Envoyée", "Contre-proposition", "Acceptée", "Offerte", "Clôturée",
  ]);
  const titles = (name: string) => column(page, name).getByRole("listitem").locator(".thread-row-text");
  await expect(titles("Brouillon")).toHaveText(["Vérifier les marges"]);
  await expect(titles("À clarifier")).toHaveText(["Quelle police ?"]);
  await expect(titles("Inclus")).toHaveText(["Agrandir le titre"]);
  await expect(titles("Hors scope à chiffrer")).toHaveText(["Page FAQ"]);
  await expect(titles("Chiffrée")).toHaveText(["Version anglaise"]);
  await expect(titles("Envoyée")).toHaveText(["Blog"]);
  await expect(titles("Contre-proposition")).toHaveText(["Newsletter"]);
  await expect(titles("Acceptée")).toHaveText(["Page Équipe"]);
  await expect(titles("Offerte")).toHaveText(["Animation du logo"]);
  // A refused proposal and a closed discussion are done.
  await expect(titles("Clôturée")).toHaveText(["Couleur du logo", "Espace membre"]);
  // A card as in the editor's panel (feedback of 26 October 2026): what it is about and its amount, its title,
  // who and when; a quote's amount marked as such, an offer's as a gift.
  const accepted = column(page, "Acceptée").getByRole("listitem");
  await expect(accepted.locator(".thread-row-status")).toHaveText(/^maquette\.pdf · V01\s*900\s€ HT$/);
  await expect(accepted.locator(".thread-row-amount .lucide-receipt-text")).toBeVisible();
  await expect(column(page, "Offerte").getByRole("listitem").locator(".thread-row-amount.is-offer .lucide-gift")).toBeVisible();
  await expect(accepted.locator(".thread-row-meta")).toContainText("Claire Dubois");
  await expect(accepted.locator(".thread-row-meta .thread-avatar")).toHaveText("C");

  // As tall as the window, the page itself not scrolling: each column scrolls on its own.
  const pageHeight = await page.evaluate(() => [document.documentElement.scrollHeight, window.innerHeight]);
  expect(pageHeight[0]).toBeLessThanOrEqual(pageHeight[1]);
  const boardBox = await board(page).boundingBox();
  const viewport = page.viewportSize();
  expect(boardBox && viewport && boardBox.y + boardBox.height).toBeGreaterThan((viewport?.height ?? 0) - 80);
  // Its scrollbars thin, so that they never draw the eye.
  expect(await board(page).evaluate((element) => getComputedStyle(element).scrollbarWidth)).toBe("thin");

  // One deliverable only.
  const filters = page.getByRole("group", { name: "Filtrer les demandes" });
  await filters.getByRole("combobox", { name: "Livrable" }).click();
  await page.getByRole("option", { name: "logo.png" }).click();
  await expect(board(page).locator(".thread-row-text")).toHaveText(["Couleur du logo"]);
  await expect(filters).toContainText("1 demande");

  // A card opens its request on its version.
  await expect(column(page, "Clôturée").getByRole("link", { name: "Ouvrir la demande « Couleur du logo »" })).toHaveAttribute("href", "/projets/1/livrables/2?demande=60");
  expect(errors).toEqual([]);
});

test("inside a deliverable, the rail opens the board of its own requests; the rail stays, and leads back to the canvas", async ({ browser }) => {
  const { alice } = await projectWithRequests();
  const { page, errors } = await newPerson(browser);
  await signInPage(page, alice.email);
  await page.goto("/projets/1/livrables/1");
  const rail = page.getByRole("navigation", { name: "Outils" });
  await rail.getByRole("button", { name: "Pipeline des demandes" }).click();
  await expect(page).toHaveURL(/\/projets\/1\/livrables\/1\/demandes$/);
  // This deliverable's requests only, without the project's filter; the rail still there.
  await expect(board(page).locator(".thread-row-text")).toHaveCount(10);
  await expect(board(page)).not.toContainText("Couleur du logo");
  await expect(page.getByRole("group", { name: "Filtrer les demandes" }).getByRole("combobox")).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1, name: "Pipeline des demandes" })).toBeVisible();
  await expect(rail.getByRole("button", { name: "Pipeline des demandes" })).toHaveAttribute("aria-pressed", "true");
  // Its name everywhere around: a card says its version only.
  await expect(column(page, "Inclus").locator(".board-card-context")).toHaveText("V01");
  // A card opens its request on the canvas; the rail's button leads back to it too.
  await expect(column(page, "Inclus").getByRole("link", { name: "Ouvrir la demande « Agrandir le titre »" })).toHaveAttribute("href", "/projets/1/livrables/1?demande=52");
  await rail.getByRole("button", { name: "Pipeline des demandes" }).click();
  await expect(page).toHaveURL(/\/projets\/1\/livrables\/1$/);
  await expect(page.locator("[data-page]").first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("an accepted proposal is marked paid by an administrator only, in the journal, never for the client; not shown on the board for now", async ({ browser }) => {
  const { alice, org, token } = await projectWithRequests();
  // Not on the board for now (feedback of 25 October 2026): the server is ready.
  const { page, errors } = await newPerson(browser);
  await signInPage(page, alice.email);
  await page.goto("/projets/1/demandes");
  await expect(column(page, "Acceptée").getByRole("listitem")).toContainText("Page Équipe");
  await expect(board(page).getByRole("button")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /payée/ })).toHaveCount(0);

  expect((await call("/api/comments/57/payment", { method: "PUT", person: alice, body: { paid: true } })).status).toBe(200);
  await expect.poll(() => paidAtOf(org, 57)).not.toBeNull();
  expect(await eventsOf(org, "proposal.paid")).toEqual(["Proposition marquée payée"]);

  // The client's review: the request, never its payment.
  const email = `${unique("claire")}@client.test`;
  await call("/api/review-access/invite", { person: alice, body: { linkKey: "1:1", emails: [email] } });
  const client = await verifiedClient(token, email, "Claire Dubois");
  const review = await call(`/api/review/${token}`, { person: client });
  expect(review.status).toBe(200);
  expect(JSON.stringify(review.json)).toContain("Page Équipe");
  expect(JSON.stringify(review.json)).not.toContain("paidAt");
  expect(JSON.stringify(review.json)).not.toContain("paidBy");

  // Only an accepted proposal is paid: one still waiting is refused.
  expect((await call("/api/comments/55/payment", { method: "PUT", person: alice, body: { paid: true } })).status).toBe(409);
  expect(await paidAtOf(org, 55)).toBeNull();

  // A member may not, either way.
  const bruno = await addColleague(alice, "Bruno Petit", "member");
  const refused = await call("/api/comments/57/payment", { method: "PUT", person: bruno, body: { paid: false } });
  expect(refused.status).toBe(403);
  expect(refused.json).toMatchObject({ code: "ADMIN_ONLY" });
  expect(await paidAtOf(org, 57)).not.toBeNull();

  // Taken back by the administrator: in the journal too.
  expect((await call("/api/comments/57/payment", { method: "PUT", person: alice, body: { paid: false } })).status).toBe(200);
  await expect.poll(() => paidAtOf(org, 57)).toBeNull();
  expect(await eventsOf(org, "proposal.unpaid")).toEqual(["Paiement retiré"]);
  expect(errors).toEqual([]);
});
