// The deliverable editor after the October feedback: « Demandes » and « Commentaires » (drafts, closed
// discussions), out-of-scope requests by status, closing a discussion, a client's message said at once,
// unread pins, the bell in the requests panel, the hand tool and the wheel button, and « + » opening the
// new deliverable dialog.

import { expect, test, type Browser } from "@playwright/test";
import { call, createAgency, newPerson, seedState, signInPage, signUp, sql, unique, verifiedClient, type Member } from "./helpers";

const quote = (id: number, commentId: number, status: string) => ({ id, commentId, version: 1, amount: 900, deadline: 3, status, createdAt: "x", description: "Devis" });
const request = (id: number, title: string) => ({ id, deliverableId: 1, author: "Alice Martin", initials: "AM", from: "agency", kind: "request", message: title, title, decision: "Hors périmètre", location: "", time: "t" });

async function editor(browser: Browser) {
  const alice = await signUp("Alice Martin");
  await createAgency(alice, "Studio Panneau");
  await seedState(alice, {
    lists: {
      clients: { upsert: [{ id: 1, name: "Northwind" }], remove: [] },
      projects: { upsert: [{ id: 1, name: "Refonte", clientId: 1, client: "Northwind", status: "En cours" }], remove: [] },
      deliverables: {
        upsert: [
          { id: 1, projectId: 1, name: "maquette.pdf", type: "PDF", version: 1, status: "En attente client", locked: false, importedAt: "14/10/2026" },
          { id: 2, projectId: 1, name: "logo.png", type: "Image", version: 1, status: "Brouillon", locked: false, importedAt: "14/10/2026" },
        ],
        remove: [],
      },
      comments: {
        upsert: [
          // The client's comment, not read yet.
          { id: 30, deliverableId: 1, author: "Claire Dubois", initials: "CD", from: "client", message: "Le logo plus grand", decision: "À qualifier", kind: "remark", location: "Page 1", page: 1, position: { x: 30, y: 20 }, time: "t" },
          // A pin of the agency, no status chosen: its draft.
          { id: 31, deliverableId: 1, author: "Alice Martin", initials: "AM", from: "agency", message: "Vérifier les marges", decision: "À qualifier", kind: "remark", location: "Page 1", page: 1, position: { x: 60, y: 40 }, time: "t" },
          // Out of scope, at every stage: not quoted, quoted, sent, accepted.
          request(40, "Page FAQ"),
          request(41, "Version anglaise"),
          request(42, "Blog"),
          request(43, "Newsletter"),
        ],
        remove: [],
      },
    },
    maps: {
      proposalStates: { upsert: { "41": "draft", "42": "sent", "43": "sent" }, remove: [] },
      proposalVersions: { upsert: { "41": [quote(410, 41, "draft")], "42": [quote(420, 42, "sent")], "43": [quote(430, 43, "accepted")] }, remove: [] },
      proposalDecisions: { upsert: { "43": "accepted" }, remove: [] },
    },
  });
  const { page, errors } = await newPerson(browser);
  await page.setViewportSize({ width: 1400, height: 900 });
  await signInPage(page, alice.email);
  await page.goto("/projets/1/livrables/1");
  await expect(page.locator("[data-page]").first()).toBeVisible();
  return { page, errors };
}

test("drafts and closed discussions sit in « Commentaires »; out-of-scope requests filter by status", async ({ browser }) => {
  // A long scenario (views, qualifying, four statuses): more time when the machine is loaded, same checks.
  test.slow();
  const { page, errors } = await editor(browser);
  const panel = page.getByRole("complementary", { name: "Demandes" });
  const views = panel.getByRole("tablist", { name: "Vue du panneau" });
  const list = panel.getByRole("tabpanel");
  // « Demandes »: what the client sees, by status; the agency's draft is not among them.
  await expect(views.getByRole("tab", { name: /^Demandes/ })).toHaveAttribute("aria-selected", "true");
  await panel.getByRole("tab", { name: /^À clarifier/ }).click();
  await expect(list).toContainText("Le logo plus grand");
  await expect(list).not.toContainText("Vérifier les marges");
  await expect(panel.getByRole("tab", { name: /^Mes brouillons/ })).toHaveCount(0);
  // « Commentaires »: its drafts, and the closed discussions.
  await views.getByRole("tab", { name: /^Commentaires/ }).click();
  await expect(panel.getByRole("tab", { name: /^Mes brouillons\s*1/ })).toBeVisible();
  await expect(panel.getByRole("tab", { name: /^Discussions clôturées\s*0/ })).toBeVisible();
  await expect(list).toContainText("Vérifier les marges");

  // Qualified « À clarifier » with a title, the draft becomes a request to clarify.
  await page.getByRole("button", { name: /^Commentaire #31 :/ }).click();
  await page.getByRole("button", { name: "Créer une demande" }).click();
  await page.getByRole("radio", { name: /^À clarifier/ }).click();
  await page.getByLabel("Titre de la demande").fill("Marges à confirmer");
  await page.getByRole("button", { name: "Créer la demande" }).click();
  // Qualified, it leaves the drafts: back in « Demandes ».
  await expect(panel.getByRole("tab", { name: /^Mes brouillons/ })).toHaveCount(0);
  await expect(views.getByRole("tab", { name: /^Demandes/ })).toHaveAttribute("aria-selected", "true");
  await panel.getByRole("tab", { name: /^À clarifier/ }).click();
  await expect(list).toContainText("Marges à confirmer");

  // Out of scope: each request tagged with its status, and the list filtered by one.
  await panel.getByRole("tab", { name: /^Hors scope/ }).click();
  await expect(list.getByRole("listitem")).toHaveCount(4);
  await expect(list.getByRole("listitem").filter({ hasText: "Page FAQ" })).toContainText("À chiffrer");
  await expect(list.getByRole("listitem").filter({ hasText: "Version anglaise" })).toContainText("Proposition prête");
  await expect(list.getByRole("listitem").filter({ hasText: "Blog" })).toContainText("En attente du client");
  // The quote's figures, each with its label.
  await expect(list.getByRole("listitem").filter({ hasText: "Blog" }).locator(".client-proposal-line")).toContainText("Montant900 € HT");
  await expect(list.getByRole("listitem").filter({ hasText: "Blog" }).locator(".client-proposal-line")).toContainText("Délai supplémentaire+ 3 jours");
  // A click beside the action buttons selects the card too.
  await list.getByRole("listitem").filter({ hasText: "Blog" }).getByText("Délai supplémentaire").click();
  await expect(list.getByRole("listitem").filter({ hasText: "Blog" })).toHaveClass(/is-selected/);
  await expect(list.getByRole("listitem").filter({ hasText: "Newsletter" })).toContainText("Acceptée");
  // Only the actions that can be done: no « Envoyer » on a request not quoted yet.
  await expect(list.getByRole("listitem").filter({ hasText: "Page FAQ" }).getByRole("button", { name: "Envoyer la proposition" })).toHaveCount(0);
  await expect(list.getByRole("listitem").filter({ hasText: "Version anglaise" }).getByRole("button", { name: "Envoyer la proposition" })).toBeVisible();
  await panel.getByRole("combobox", { name: "Filtrer par statut" }).click();
  await page.getByRole("option", { name: "En attente du client · 1" }).click();
  await expect(list.getByRole("listitem")).toHaveCount(1);
  await expect(list).toContainText("Blog");
  expect(errors).toEqual([]);
});

/** A version shared with a verified client, Claire, with her comment and a quote waiting for her answer. */
async function sharedVersion(browser: Browser) {
  const alice = await signUp("Alice Martin");
  await createAgency(alice, "Studio Clôture");
  const token = unique("tok-close");
  await seedState(alice, {
    lists: {
      clients: { upsert: [{ id: 1, name: "Northwind" }], remove: [] },
      projects: { upsert: [{ id: 1, name: "Refonte", clientId: 1, client: "Northwind", status: "En cours" }], remove: [] },
      deliverables: { upsert: [{ id: 1, projectId: 1, name: "maquette.pdf", type: "PDF", version: 1, status: "En attente client", locked: false, importedAt: "14/10/2026" }], remove: [] },
      comments: {
        upsert: [
          { id: 30, deliverableId: 1, author: "Claire Dubois", initials: "CD", from: "client", message: "Le logo plus grand", decision: "À qualifier", kind: "remark", location: "Page 1", page: 1, position: { x: 30, y: 20 }, time: "t" },
          { ...request(42, "Blog"), page: 1, position: { x: 60, y: 60 } },
        ],
        remove: [],
      },
    },
    maps: {
      reviewLinks: { upsert: { "1:1": { token, active: true, expiresAt: "01/01/2099", autoExpire: true, deliverableId: 1, version: 1 } }, remove: [] },
      proposalStates: { upsert: { "42": "sent" }, remove: [] },
      proposalVersions: { upsert: { "42": [quote(420, 42, "sent")] }, remove: [] },
    },
  });
  const email = `${unique("claire")}@client.test`;
  await call("/api/review-access/invite", { person: alice, body: { linkKey: "1:1", emails: [email] } });
  const client = await verifiedClient(token, email, "Claire Dubois");
  const { page, errors } = await newPerson(browser);
  await page.setViewportSize({ width: 1400, height: 900 });
  await signInPage(page, alice.email);
  await page.goto("/projets/1/livrables/1");
  await expect(page.locator("[data-page]").first()).toBeVisible();
  const clientReply = (id: number, message: string) => call(`/api/review/${token}/comments/${id}/replies`, { method: "POST", person: client, body: { message } });
  const agencyReply = (member: Member, id: number, message: string) => call(`/api/comments/${id}/replies`, { method: "POST", person: member, body: { message } });
  return { alice, org: alice.organizationId!, token, client, page, errors, clientReply, agencyReply };
}

test("a closed discussion is read-only for both sides until the agency reopens it; never while a proposal waits", async ({ browser }) => {
  const { alice, org, token, client, page, errors, clientReply, agencyReply } = await sharedVersion(browser);
  // A proposal waiting for the client's answer: the discussion stays open.
  const refused = await call("/api/comments/42/closure", { method: "PUT", person: alice, body: { closed: true } });
  expect(refused.status).toBe(409);

  await page.getByRole("button", { name: /^Commentaire #30 :/ }).click();
  await page.getByRole("button", { name: "Clôturer la discussion" }).click();
  await expect.poll(async () => (await sql<{ closed: boolean | null }>("select (data->>'closed')::boolean as closed from comments where organization_id = $1 and id = 30", [org]))[0]?.closed).toBe(true);
  const bubble = page.getByRole("dialog", { name: /#30$/ });
  await expect(bubble).toContainText("Discussion close. Rouvrez-la pour répondre.");
  await expect(bubble.getByRole("textbox", { name: "Répondre" })).toHaveCount(0);
  const panel = page.getByRole("complementary", { name: "Demandes" });
  await expect(panel.getByRole("tab", { name: /^Discussions clôturées\s*1/ })).toHaveAttribute("aria-selected", "true");
  await expect(panel.getByRole("tabpanel")).toContainText("Le logo plus grand");

  // Nobody replies to it; the client still reads it, marked closed.
  expect((await clientReply(30, "Encore une chose")).status).toBe(409);
  expect((await agencyReply(alice, 30, "Une précision")).status).toBe(409);
  const seen = (await call(`/api/review/${token}`, { person: client })).json as { state: { comments: { id: number; closed?: boolean }[] } };
  expect(seen.state.comments.find((comment) => comment.id === 30)?.closed).toBe(true);
  // An event in the journal, for the proof.
  expect((await sql("select 1 from audit_events where organization_id = $1 and type = 'comment.closed'", [org])).length).toBe(1);

  // Its pin leaves the deliverable once its bubble is closed; the panel still lists it, and opens it.
  await bubble.getByRole("button", { name: "Fermer", exact: true }).click();
  await expect(page.locator('[data-pin="30"]')).toHaveCount(0);
  await panel.getByRole("tabpanel").getByRole("button", { name: /#30$/ }).click();
  await expect(bubble).toBeVisible();

  await bubble.getByRole("button", { name: "Rouvrir la discussion" }).click();
  await expect.poll(async () => (await clientReply(30, "Encore une chose")).status).toBe(200);
  expect(errors).toEqual([]);
});

test("a qualified request is closed, never deleted: by the agency or by the client", async ({ browser }) => {
  const { alice, org, token, client, page, errors } = await sharedVersion(browser);
  const exists = async (id: number | string) => (await sql("select 1 from comments where organization_id = $1 and id = $2", [org, id])).length === 1;
  // The agency's draft: deleted.
  const draft = await call("/api/comments", { method: "POST", person: alice, body: { deliverableId: 1, message: "Brouillon à jeter", page: 1, position: { x: 10, y: 10 } } });
  expect((await call(`/api/comments/${draft.json.id}`, { method: "DELETE", person: alice })).status).toBe(200);
  expect(await exists(draft.json.id as number)).toBe(false);
  // Qualified, even « À clarifier »: refused, it stays.
  const kept = await call("/api/comments", { method: "POST", person: alice, body: { deliverableId: 1, message: "Note qualifiée", page: 1, position: { x: 20, y: 20 } } });
  expect((await call(`/api/comments/${kept.json.id}/qualification`, { method: "PUT", person: alice, body: { decision: "À qualifier", title: "Marges ?" } })).status).toBe(200);
  const refused = await call(`/api/comments/${kept.json.id}`, { method: "DELETE", person: alice });
  expect(refused.status).toBe(409);
  expect(refused.json.error).toContain("clôturez-la");
  expect(await exists(kept.json.id as number)).toBe(true);
  // The client's own comment, once the agency qualified it: refused too.
  expect((await call("/api/comments/30/qualification", { method: "PUT", person: alice, body: { decision: "Inclus", title: "Logo plus grand" } })).status).toBe(200);
  expect((await call(`/api/review/${token}/comments/30`, { method: "DELETE", person: client })).status).toBeGreaterThanOrEqual(400);
  expect(await exists(30)).toBe(true);
  // In the editor: no « Supprimer » on a qualified request, « Clôturer » instead.
  await page.reload();
  await page.getByRole("button", { name: new RegExp(`#${kept.json.id} :`) }).click();
  const bubble = page.getByRole("dialog", { name: new RegExp(`#${kept.json.id}$`) });
  await expect(bubble.getByRole("button", { name: "Clôturer la discussion" })).toBeVisible();
  await expect(bubble.getByRole("button", { name: "Supprimer" })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("qualifying: a required field left empty says so in red, under it", async ({ browser }) => {
  const { page, errors } = await sharedVersion(browser);
  await page.getByRole("button", { name: /^Commentaire #30 :/ }).click();
  await page.getByRole("button", { name: "Créer une demande" }).click();
  await page.getByRole("radio", { name: /^Hors scope/ }).click();
  await page.getByRole("switch", { name: /Chiffrer maintenant/ }).click();
  await page.getByRole("button", { name: "Créer la demande" }).click();
  const title = page.getByLabel(/Titre de la demande/);
  await expect(title).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByText("Ce champ est obligatoire.")).toHaveCount(2);
  await title.fill("Section blog");
  await expect(title).not.toHaveAttribute("aria-invalid", "true");
  await expect(page.getByText("Ce champ est obligatoire.")).toHaveCount(1);
  await page.getByLabel(/Montant HT/).fill("900");
  await expect(page.getByText("Ce champ est obligatoire.")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("a request without pin opens by the panel; a long one scrolls in its bubble; a card is selected by its stroke", async ({ browser }) => {
  const { alice, page, errors } = await sharedVersion(browser);
  const lines = Array.from({ length: 30 }, (_, at) => `Point ${at + 1} à reprendre`).join("\n");
  const created = await call("/api/comments", { method: "POST", person: alice, body: { request: { deliverableId: 1, decision: "Inclus", title: "Reprise générale", description: lines } } });
  expect(created.status).toBe(200);
  await page.reload();
  const panel = page.getByRole("complementary", { name: "Demandes" });
  await panel.getByRole("tab", { name: /^Inclus/ }).click();
  const card = panel.getByRole("listitem").filter({ hasText: "Reprise générale" });
  await card.getByRole("button").first().click();

  // Docked at the canvas's right edge, beside the panel, within the screen.
  const bubble = page.getByRole("dialog", { name: /^Demande incluse #\d+$/ });
  await expect(bubble).toBeVisible();
  const box = (await bubble.boundingBox())!;
  const canvas = (await page.getByRole("region", { name: "Canevas" }).boundingBox())!;
  expect(canvas.x + canvas.width - (box.x + box.width)).toBeLessThan(40);
  expect(box.y + box.height).toBeLessThanOrEqual(900);
  // Its long text scrolls inside it; its line breaks are kept.
  expect(await bubble.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  expect(await bubble.locator(".request-description").evaluate((element) => getComputedStyle(element).whiteSpace)).toBe("pre-line");

  // The selected card: a black stroke on white, no tint.
  await expect(card).toHaveClass(/is-selected/);
  // (The stroke's color is animated: read once it has settled.)
  await expect.poll(() => card.evaluate((element) => [getComputedStyle(element).backgroundColor, getComputedStyle(element).borderColor])).toEqual(["rgb(255, 255, 255)", "rgb(17, 17, 17)"]);
  expect(errors).toEqual([]);
});

test("« Exporter en PDF » opens the version's requests as a printable page, without the agency's drafts", async ({ browser }) => {
  const { page, errors } = await editor(browser);
  await page.getByRole("button", { name: "Copier ou exporter les demandes" }).click();
  const [printable] = await Promise.all([page.waitForEvent("popup"), page.getByRole("menuitem", { name: "Exporter en PDF" }).click()]);
  await expect(printable.locator("header")).toContainText("DEMANDES DU LIVRABLE");
  await expect(printable.locator("main")).toContainText("Le logo plus grand");
  await expect(printable.locator("main")).toContainText("Hors scope · 4");
  await expect(printable.locator("main")).toContainText("En attente du client");
  // The agency's own draft is not exported.
  await expect(printable.locator("main")).not.toContainText("Vérifier les marges");
  await expect(printable.getByRole("button", { name: "Imprimer ou enregistrer en PDF" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("the conversation goes on once a request is qualified, out of scope too, for the agency and the client", async ({ browser }) => {
  const { org, page, errors, clientReply } = await sharedVersion(browser);
  const replies = async () => ((await sql<{ data: { replies?: { message: string }[] } }>("select data from comments where organization_id = $1 and id = 42", [org]))[0]?.data.replies ?? []).map((reply) => reply.message);
  await page.getByRole("button", { name: /^Demande hors scope #42 :/ }).click();
  const bubble = page.getByRole("dialog", { name: /#42$/ });
  await expect(bubble).not.toContainText("la discussion est close");
  // « Détail » first; the conversation in « Discussion ».
  await expect(bubble.getByRole("tab", { name: "Détail" })).toHaveAttribute("aria-selected", "true");
  await bubble.getByRole("tab", { name: /^Discussion/ }).click();
  await bubble.getByRole("textbox", { name: "Répondre" }).fill("Le blog inclut-il la newsletter ?");
  await bubble.getByRole("button", { name: "Envoyer la réponse" }).click();
  await expect.poll(replies).toEqual(["Le blog inclut-il la newsletter ?"]);
  // The client answers on the same request; the agency reads it in the open bubble.
  expect((await clientReply(42, "Non, à part")).status).toBe(200);
  await expect(bubble).toContainText("Non, à part");
  expect(await replies()).toEqual(["Le blog inclut-il la newsletter ?", "Non, à part"]);
  expect(errors).toEqual([]);
});

test("a client's message shows at the agency at once: a notice, and a red count on its card", async ({ browser }) => {
  const { page, errors, clientReply } = await sharedVersion(browser);
  const panel = page.getByRole("complementary", { name: "Demandes" });
  const card = panel.getByRole("listitem").filter({ hasText: "Le logo plus grand" });
  await expect(card).toContainText("1 message non lu");
  // Written while the agency is on the page: no reload.
  expect((await clientReply(30, "Et la couleur du bouton ?")).status).toBe(200);
  await expect(page.getByText("Claire Dubois a écrit")).toBeVisible();
  await expect(card).toContainText("2 messages non lus");
  await expect(card.locator(".thread-row-replies")).toHaveClass(/is-unread/);
  // Opened, read: the count gives way to the number of replies.
  await card.getByRole("button").first().click();
  await expect(card).toContainText("1 réponse");
  expect(errors).toEqual([]);
});

test("a client's pin shows it is unread until opened; the bell heads the requests panel", async ({ browser }) => {
  const { page, errors } = await editor(browser);
  const unread = page.getByRole("button", { name: /Commentaire #30 : Le logo plus grand \(non lu\)/ });
  await expect(unread).toHaveClass(/is-unread/);
  // The agency's own pin is never « unread ».
  await expect(page.getByRole("button", { name: /^Commentaire #31 :/ })).not.toHaveClass(/is-unread/);
  await unread.click();
  await expect(page.getByRole("button", { name: /^Commentaire #30 : Le logo plus grand$/ })).not.toHaveClass(/is-unread/);

  const panel = page.getByRole("complementary", { name: "Demandes" });
  await expect(panel.getByRole("button", { name: /^Notifications/ })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Navigation du livrable" }).getByRole("button", { name: /^Notifications/ })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("the hand moves the view, the wheel button too in comment mode; « + » opens the deliverable dialog", async ({ browser }) => {
  const { page, errors } = await editor(browser);
  const toolbar = page.getByRole("toolbar", { name: "Outils du canevas" });
  // No import in the toolbar: a version is added from the sidebar or the deliverable's menu.
  await expect(toolbar.getByRole("button", { name: "Importer une nouvelle version" })).toHaveCount(0);
  await expect(toolbar.getByRole("button", { name: "Commentaire" })).toHaveAttribute("aria-pressed", "true");

  // Comment mode: the wheel button drags the deliverable, no comment is opened.
  const content = page.locator(".artboard-transform-content");
  const before = await content.evaluate((element) => getComputedStyle(element).transform);
  const area = (await page.locator(".artboard-transform-wrapper").boundingBox())!;
  await page.mouse.move(area.x + area.width / 2, area.y + area.height - 80);
  await page.mouse.down({ button: "middle" });
  await page.mouse.move(area.x + area.width / 2 - 120, area.y + area.height - 200, { steps: 6 });
  await page.mouse.up({ button: "middle" });
  await expect.poll(() => content.evaluate((element) => getComputedStyle(element).transform)).not.toBe(before);
  await expect(page.getByRole("textbox", { name: "Commentaire" })).toHaveCount(0);
  await expect(toolbar.getByRole("button", { name: "Main" })).toBeVisible();

  // The sidebar: the other deliverables of the project, and « + » opens the dialog, not a file picker.
  const sidebar = page.getByRole("complementary", { name: "Navigation du livrable" });
  const others = sidebar.getByRole("region", { name: "Autres livrables du projet" });
  await expect(others.getByRole("link", { name: "logo.png" })).toBeVisible();
  await expect(others.getByRole("link", { name: "maquette.pdf" })).toHaveCount(0);
  await expect(sidebar).not.toContainText("Northwind");
  await others.getByRole("button", { name: "Ajouter un livrable au projet" }).click();
  await expect(page.getByRole("dialog").filter({ hasText: "Livrable" }).first()).toBeVisible();
  expect(errors).toEqual([]);
});
