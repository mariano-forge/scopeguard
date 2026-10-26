// The agency's editor, used as a member does: comment threads and qualification end up in the
// database, signed by the server with the member, with their audit events.

import { expect, test, type Browser } from "@playwright/test";
import { createAgency, newPerson, seedState, signInPage, signUp, sql } from "./helpers";

async function editor(browser: Browser) {
  const alice = await signUp("Alice Martin");
  await createAgency(alice, "Studio Fils");
  await seedState(alice, {
    lists: {
      clients: { upsert: [{ id: 1, name: "Northwind" }], remove: [] },
      projects: { upsert: [{ id: 1, name: "Refonte", clientId: 1, client: "Northwind", status: "En cours" }], remove: [] },
      deliverables: { upsert: [{ id: 1, projectId: 1, name: "maquette.png", type: "Image", version: 1, status: "En attente client", locked: false }], remove: [] },
      comments: {
        upsert: [{ id: 30, deliverableId: 1, author: "Claire Dubois", initials: "CD", from: "client", message: "Ajouter des témoignages", decision: "À qualifier", kind: "remark", location: "Page 1", page: 1, position: { x: 70, y: 70 }, time: "t" }],
        remove: [],
      },
    },
  });
  const [user] = await sql<{ id: string }>("select id from users where email = $1", [alice.email]);
  const { page, errors } = await newPerson(browser);
  const writes: string[] = [];
  page.on("request", (request) => {
    // The AI's suggestion, asked as a qualifying form opens, is sent by POST but writes nothing (src/db/qualificationSuggestion.ts).
    if (request.method() !== "GET" && request.url().includes("/api/") && !request.url().endsWith("/suggestion")) writes.push(`${request.method()} ${new URL(request.url()).pathname}`);
  });
  await signInPage(page, alice.email);
  await page.goto("/projets/1/livrables/1");
  await expect(page.locator("[data-page]").first()).toBeVisible();
  return { org: alice.organizationId!, userId: user.id, page, errors, writes };
}

const agencyComments = (org: string) =>
  sql<{ id: string; data: Record<string, unknown> }>("select id, data from comments where organization_id = $1 and data->>'from' = 'agency' order by id", [org]);
const commentData = async (org: string, id: number) =>
  (await sql<{ data: Record<string, unknown> }>("select data from comments where organization_id = $1 and id = $2", [org, id]))[0]?.data;
const events = (org: string, type: string) => sql<{ recorded_by: string; comment_id: string | null }>("select recorded_by, comment_id from audit_events where organization_id = $1 and type = $2", [org, type]);

test("a member comments, replies, edits and deletes in the editor; each write is recorded", async ({ browser }) => {
  const { org, userId, page, errors, writes } = await editor(browser);

  await page.locator("[data-page]").first().click({ position: { x: 120, y: 90 } });
  await page.getByRole("textbox", { name: "Commentaire" }).fill("Logo à agrandir");
  await page.getByRole("button", { name: "Publier" }).click();
  await expect.poll(async () => (await agencyComments(org)).map((row) => row.data.message)).toEqual(["Logo à agrandir"]);
  const [created] = await agencyComments(org);
  expect(created.data).toMatchObject({ author: "Alice Martin", initials: "AM", from: "agency", decision: "À qualifier", deliverableId: 1, page: 1 });
  await expect.poll(async () => (await events(org, "comment.created")).map((event) => event.recorded_by)).toEqual([userId]);
  // A pin of the agency, no status chosen: its draft, in « Commentaires · Brouillons », the client does not see it.
  const panel = page.getByRole("complementary", { name: "Demandes" });
  await expect(panel.getByRole("tab", { name: /^Mes brouillons\s*1/ })).toHaveAttribute("aria-selected", "true");
  // Its bubble says so: a draft, which the client does not see until it is qualified.
  const draftNote = page.getByRole("note").filter({ hasText: "Invisible pour le client tant qu’il n’est pas qualifié." });
  await expect(draftNote).toBeVisible();
  // Hovered, its pin shows who wrote it and its first words, before it is opened.
  await page.getByRole("button", { name: "Fermer", exact: true }).click();
  const pin = page.locator(`[data-pin="${created.id}"]`);
  await pin.hover();
  await expect(pin.locator(".pin-preview")).toBeVisible();
  await expect(pin.locator(".pin-preview")).toContainText("Alice Martin");
  await expect(pin.locator(".pin-preview")).toContainText("Logo à agrandir");
  // An order to read it in: the name first (in bold), then the words, the time and the replies quieter.
  await expect(pin.locator(".pin-preview-text")).toHaveCSS("font-size", "13px");
  await expect(pin.locator(".pin-preview .thread-meta b")).toHaveCSS("font-weight", "600");
  await expect(pin.locator(".pin-preview .thread-meta small")).toHaveCSS("color", "rgb(76, 76, 72)");
  await pin.click();
  await expect(pin.locator(".pin-preview")).toBeHidden();
  // The same three choices as « + Demande »: « À clarifier » chosen with a title makes it a request the client sees.
  await page.getByRole("button", { name: "Qualifier", exact: true }).click();
  await page.getByRole("radio", { name: /^À clarifier/ }).click();
  // Sent without its title: the cursor in it, said so, nothing written.
  await page.getByLabel("Titre de la demande").fill("");
  await page.getByRole("button", { name: "Créer la demande" }).click();
  await expect(page.getByLabel("Titre de la demande")).toBeFocused();
  await expect(page.getByText("Ce champ est obligatoire.")).toBeInViewport();
  await page.getByLabel("Titre de la demande").fill("Taille du logo à confirmer");
  await page.getByRole("button", { name: "Créer la demande" }).click();
  await expect.poll(async () => (await agencyComments(org))[0].data).toMatchObject({ decision: "À qualifier", title: "Taille du logo à confirmer" });
  // It joins the client's comment already there; no longer a draft, the note leaves.
  await expect(draftNote).toHaveCount(0);
  await expect(panel.getByRole("tab", { name: /^À clarifier\s*2/ })).toHaveAttribute("aria-selected", "true");
  // Qualified, it is a request: its title, and « À clarifier » as its status, never « Commentaire » again.
  const bubble = page.getByRole("dialog", { name: /^Demande à clarifier #\d+$/ });
  // Its head says who wrote it and when, not a number from the database.
  await expect(bubble.locator(".thread-title")).toContainText("Alice Martin");
  await expect(bubble).not.toContainText("n°");
  await expect(bubble.locator(".request-kind")).toContainText("À clarifier");
  // The status alone, without a hint of what it means.
  await expect(bubble.locator(".request-kind-hint")).toHaveCount(0);
  await expect(bubble).toContainText("Taille du logo à confirmer");
  // Out of draft, nothing of it is internal any more: no such label.
  await expect(page.getByText(/Interne, non visible/)).toHaveCount(0);
  // Then « Inclus », then back to clarify: still a request.
  await bubble.getByRole("button", { name: "Modifier", exact: true }).click();
  await page.getByRole("radio", { name: /^Inclus/ }).click();
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect.poll(async () => (await agencyComments(org))[0].data.decision).toBe("Inclus");
  const included = page.getByRole("dialog", { name: /^Demande incluse #\d+$/ });
  await expect(included.locator(".request-kind")).toContainText("Inclus");
  await included.getByRole("button", { name: "Remettre à clarifier" }).click();
  await expect.poll(async () => (await agencyComments(org))[0].data).toMatchObject({ decision: "À qualifier", title: "Taille du logo à confirmer" });
  await expect(page.getByRole("dialog", { name: /^Demande à clarifier #\d+$/ }).locator(".thread-title")).toContainText("Alice Martin");
  await expect(page.getByText(/^Commentaire n°/)).toHaveCount(0);

  // A request: its discussion is the bubble's second tab.
  await page.getByRole("tab", { name: "Discussion", exact: true }).click();
  await page.getByRole("textbox", { name: "Répondre" }).fill("Version mobile aussi");
  await page.getByRole("button", { name: "Envoyer la réponse" }).click();
  await expect.poll(async () => ((await agencyComments(org))[0].data.replies as { message: string }[] | undefined)?.map((reply) => reply.message)).toEqual(["Version mobile aussi"]);
  // Written once the request shows to the client: addressed to them, not internal.
  expect(((await agencyComments(org))[0].data.replies as { internal: boolean }[])[0].internal).toBe(false);
  await expect(page.getByText(/Interne, non visible/)).toHaveCount(0);
  await expect.poll(async () => (await events(org, "reply.created")).length).toBe(1);

  await page.getByRole("button", { name: "Actions sur le message" }).first().click();
  await page.getByRole("menuitem", { name: "Modifier le message" }).click();
  await page.getByRole("textbox", { name: "Modifier le message" }).fill("Logo à agrandir nettement");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect.poll(async () => (await agencyComments(org))[0].data).toMatchObject({ message: "Logo à agrandir nettement", edited: true });

  // The reply is shown before its own delete button is used.
  await expect(page.locator(".thread-text", { hasText: "Version mobile aussi" })).toBeVisible();
  await page.getByRole("button", { name: "Actions sur le message" }).last().click();
  await page.getByRole("menuitem", { name: "Supprimer le message" }).click();
  await expect.poll(async () => ((await agencyComments(org))[0].data.replies as unknown[] | undefined)?.length ?? 0).toBe(0);
  // Qualified, the request is not deleted any more: it is closed, and stays (with its history).
  await expect(page.getByRole("button", { name: "Supprimer", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Clôturer la discussion" }).click();
  await expect.poll(async () => (await agencyComments(org))[0]?.data.closed).toBe(true);
  await expect.poll(async () => (await events(org, "comment.closed")).length).toBe(1);
  // One request per action; nothing of it through the generic state sync.
  expect(writes.filter((write) => write.includes("/api/comments"))).toEqual([
    "POST /api/comments",
    // « À clarifier » with a title, « Inclus », back to clarify.
    expect.stringMatching(/^PUT \/api\/comments\/\d+\/qualification$/),
    expect.stringMatching(/^PUT \/api\/comments\/\d+\/qualification$/),
    expect.stringMatching(/^PUT \/api\/comments\/\d+\/qualification$/),
    expect.stringMatching(/^POST \/api\/comments\/\d+\/replies$/),
    expect.stringMatching(/^PATCH \/api\/comments\/\d+$/),
    expect.stringMatching(/^DELETE \/api\/comments\/\d+\/replies\/\d+$/),
    expect.stringMatching(/^PUT \/api\/comments\/\d+\/closure$/),
  ]);
  expect(writes.filter((write) => write === "PATCH /api/state")).toEqual([]);
  expect(errors).toEqual([]);
});

test("a member qualifies a client remark as out of scope, with a draft quote", async ({ browser }) => {
  const { org, page, errors, writes } = await editor(browser);
  await page.locator('[data-pin="30"]').click();
  // The client's own remark: they see it already.
  await expect(page.getByRole("note").filter({ hasText: "Non visible par le client" })).toHaveCount(0);
  await page.getByRole("button", { name: "Qualifier", exact: true }).click();
  // The two qualifications, named for what they mean against the quote.
  await expect(page.getByRole("radio", { name: /^Inclus/ })).toContainText("Prévu au devis");
  await expect(page.getByRole("tab", { name: /^Inclus/ })).toBeVisible();
  await page.getByRole("radio", { name: /Hors scope/ }).click();
  await page.getByLabel("Titre de la demande").fill("Section témoignages");
  await page.getByRole("switch").check();
  await page.getByLabel("Montant HT").fill("850");
  await page.getByLabel("Délai", { exact: true }).fill("3");
  await page.getByLabel("Le client peut faire une contre-proposition").check();
  await page.getByRole("button", { name: "Créer la demande" }).click();

  await expect.poll(async () => commentData(org, 30)).toMatchObject({ decision: "Hors périmètre", kind: "request", title: "Section témoignages", from: "client", message: "Ajouter des témoignages" });
  await expect.poll(async () => (await sql<{ state: string }>("select state from comment_proposals where organization_id = $1 and comment_id = 30", [org]))[0]?.state).toBe("draft");
  const [quote] = await sql<{ status: string; data: Record<string, unknown> }>("select status, data from proposal_versions where organization_id = $1 and comment_id = 30", [org]);
  expect(quote).toMatchObject({ status: "draft", data: { amount: 850, deadline: 3, allowCounter: true, description: "Section témoignages" } });
  await expect.poll(async () => (await events(org, "scope.classified")).map((event) => event.comment_id)).toEqual(["30"]);
  await expect.poll(async () => (await events(org, "proposal.drafted")).length).toBe(1);
  expect(writes.filter((write) => write.includes("/api/comments") || write === "PATCH /api/state")).toEqual(["PUT /api/comments/30/qualification"]);
  // Its bubble: « Hors scope » alone, no second tag; under the request's words, the foot of a quote: its extra delay, then its total,
  // and the send button under it, the width of it; the grey footer holds the request's other actions.
  const bubble = page.getByRole("dialog", { name: /#30$/ });
  await expect(bubble.locator(".request-kind")).toHaveText("Hors scope");
  // In its head, beside the button that closes the discussion; no longer above its title.
  const [kindBox, closeBox] = [await bubble.locator(".thread-header .request-kind").boundingBox(), await bubble.getByRole("button", { name: "Clôturer la discussion" }).boundingBox()];
  expect(kindBox!.x + kindBox!.width).toBeLessThanOrEqual(closeBox!.x);
  expect(Math.abs(kindBox!.y + kindBox!.height / 2 - (closeBox!.y + closeBox!.height / 2))).toBeLessThan(4);
  await expect(bubble.locator(".request-body .request-kind")).toHaveCount(0);
  const figures = bubble.locator(".request-body .request-figures");
  await expect(figures.getByRole("term")).toHaveText(["Délai supplémentaire", "Montant HT"]);
  await expect(figures.getByRole("definition")).toHaveText(["+ 3 jours", /^850\s€$/]);
  const footer = bubble.locator(".request-footer");
  await expect(footer.locator(".request-figures")).toHaveCount(0);
  await expect(footer.getByRole("button", { name: "Envoyer la proposition" })).toHaveCount(0);
  const send = bubble.locator(".request-body").getByRole("button", { name: "Envoyer la proposition" });
  const [sendBox, figuresBox] = [await send.boundingBox(), await figures.boundingBox()];
  expect(sendBox!.y).toBeGreaterThan(figuresBox!.y + figuresBox!.height);
  expect(Math.round(sendBox!.width)).toBe(Math.round(figuresBox!.width));
  // No source told: no « Source » tab.
  await expect(bubble.getByRole("tab")).toHaveText(["Détail", "Discussion"]);

  // « Modifier », the proposal switched off: the quote prepared goes, and the bubble says so at once.
  await bubble.getByRole("button", { name: "Modifier" }).click();
  await bubble.getByRole("switch", { name: /Préparer la proposition/ }).click();
  await bubble.getByRole("button", { name: "Enregistrer" }).click();
  await expect.poll(async () => (await sql<{ state: string }>("select state from comment_proposals where organization_id = $1 and comment_id = 30", [org]))[0]?.state).toBe("none");
  expect(await sql("select 1 from proposal_versions where organization_id = $1 and comment_id = 30", [org])).toHaveLength(0);
  await expect.poll(async () => (await events(org, "proposal.discarded")).length).toBe(1);
  await expect(bubble.locator(".request-figures")).toHaveCount(0);
  await expect(bubble.locator(".request-kind")).toHaveText("Hors scope");
  // Its next gesture where « Envoyer » was: in the request's body, its whole width; the grey foot keeps the links.
  const prepare = bubble.locator(".request-body").getByRole("button", { name: "Préparer la proposition" });
  await expect(prepare).toBeVisible();
  await expect(bubble.locator(".request-footer").getByRole("button", { name: "Préparer la proposition" })).toHaveCount(0);
  const [prepareBox, bodyBox] = [await prepare.boundingBox(), await bubble.locator(".request-body").boundingBox()];
  expect(prepareBox!.width).toBeGreaterThan(bodyBox!.width - 48);
  // Outlined, not in ink: ink is for sending.
  await expect(prepare).toHaveCSS("background-color", "rgb(255, 255, 255)");
  expect(errors).toEqual([]);
});
