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
    if (request.method() !== "GET" && request.url().includes("/api/")) writes.push(`${request.method()} ${new URL(request.url()).pathname}`);
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

  await page.getByRole("textbox", { name: "Répondre" }).fill("Version mobile aussi");
  await page.getByRole("button", { name: "Envoyer la réponse" }).click();
  await expect.poll(async () => ((await agencyComments(org))[0].data.replies as { message: string }[] | undefined)?.map((reply) => reply.message)).toEqual(["Version mobile aussi"]);
  await expect.poll(async () => (await events(org, "reply.created")).length).toBe(1);

  await page.getByRole("button", { name: "Modifier le message" }).first().click();
  await page.getByRole("textbox", { name: "Modifier le message" }).fill("Logo à agrandir nettement");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect.poll(async () => (await agencyComments(org))[0].data).toMatchObject({ message: "Logo à agrandir nettement", edited: true });

  // The reply is shown before its own delete button is used.
  await expect(page.locator(".thread-text", { hasText: "Version mobile aussi" })).toBeVisible();
  await page.getByRole("button", { name: "Supprimer le message" }).last().click();
  await expect.poll(async () => ((await agencyComments(org))[0].data.replies as unknown[] | undefined)?.length ?? 0).toBe(0);
  await page.getByRole("button", { name: "Supprimer", exact: true }).click();
  await expect.poll(async () => (await agencyComments(org)).length).toBe(0);
  await expect.poll(async () => (await events(org, "comment.deleted")).length).toBe(1);
  // One request per action; nothing of it through the generic state sync.
  expect(writes.filter((write) => write.includes("/api/comments"))).toEqual([
    "POST /api/comments",
    expect.stringMatching(/^POST \/api\/comments\/\d+\/replies$/),
    expect.stringMatching(/^PATCH \/api\/comments\/\d+$/),
    expect.stringMatching(/^DELETE \/api\/comments\/\d+\/replies\/\d+$/),
    expect.stringMatching(/^DELETE \/api\/comments\/\d+$/),
  ]);
  expect(writes.filter((write) => write === "PATCH /api/state")).toEqual([]);
  expect(errors).toEqual([]);
});

test("a member qualifies a client remark as out of scope, with a draft quote", async ({ browser }) => {
  const { org, page, errors, writes } = await editor(browser);
  await page.locator('[data-pin="30"]').click();
  await page.getByRole("button", { name: "Créer une demande" }).click();
  await page.getByRole("radio", { name: /Hors scope/ }).click();
  await page.getByLabel("Titre de la demande").fill("Section témoignages");
  await page.getByRole("switch").check();
  await page.getByLabel("Montant HT (€)").fill("850");
  await page.getByLabel("Délai (jours)").fill("3");
  await page.getByLabel("Le client peut faire une contre-proposition").check();
  await page.getByRole("button", { name: "Créer la demande" }).click();

  await expect.poll(async () => commentData(org, 30)).toMatchObject({ decision: "Hors périmètre", kind: "request", title: "Section témoignages", from: "client", message: "Ajouter des témoignages" });
  await expect.poll(async () => (await sql<{ state: string }>("select state from comment_proposals where organization_id = $1 and comment_id = 30", [org]))[0]?.state).toBe("draft");
  const [quote] = await sql<{ status: string; data: Record<string, unknown> }>("select status, data from proposal_versions where organization_id = $1 and comment_id = 30", [org]);
  expect(quote).toMatchObject({ status: "draft", data: { amount: 850, deadline: 3, allowCounter: true, description: "Section témoignages" } });
  await expect.poll(async () => (await events(org, "scope.classified")).map((event) => event.comment_id)).toEqual(["30"]);
  await expect.poll(async () => (await events(org, "proposal.drafted")).length).toBe(1);
  expect(writes.filter((write) => write.includes("/api/comments") || write === "PATCH /api/state")).toEqual(["PUT /api/comments/30/qualification"]);
  expect(errors).toEqual([]);
});
