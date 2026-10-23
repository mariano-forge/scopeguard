// The comments of a « Figma » deliverable's file brought into Kora (US-054, step 2b): when the agency opens
// it, and on « Actualiser ». A client's thread on a page up for review becomes a request « À clarifier »,
// with its replies; the agency's own threads (the connected account, its team), resolved ones and those
// on pages left out stay in Figma. Brought in, a thread is the agency's draft: the client sees it once it
// is qualified, never before. Figma is the run's stand-in (figmaStandIn.ts).

import { expect, test } from "@playwright/test";
import { baseURL } from "../../playwright.config";
import { addColleague, call, clientAction, connectFigma, createAgency, figmaLink, newPerson, seedState, signInPage, signUp, sql, unique, verifiedClient, type Member } from "./helpers";
import { figmaReads, setFigmaComments, type StandInComment } from "./figmaStandIn";

const fileKey = (prefix = "File") => `${prefix}${unique("k").replace(/[^A-Za-z0-9]/g, "")}`;
const marie = { id: "u-marie", handle: "Marie Client" };
const bruno = { id: "u-bruno", handle: "Bruno Studio" };
const paul = { id: "u-paul", handle: "Paul Client" };
const on = (node: string) => ({ node_id: node, node_offset: { x: 10, y: 20 } });

/** An agency connected to Figma, with a « Figma » deliverable on the pages Accueil and Contact (not Brouillons). */
async function figmaReview(prefix = "File") {
  const owner = await signUp("Alice Martin");
  const org = await createAgency(owner, "Studio Figma");
  await seedState(owner, {
    lists: {
      clients: { upsert: [{ id: 1, name: "Northwind" }], remove: [] },
      projects: { upsert: [{ id: 7, name: "Refonte", clientId: 1, client: "Northwind", status: "En cours" }], remove: [] },
    },
  });
  const handle = await connectFigma(owner);
  const key = fileKey(prefix);
  const receipt = (await call(`/api/integrations/figma/files/${key}`, { person: owner })).json.receipt as string;
  const made = await call("/api/deliverables", { person: owner, body: { projectId: 7, name: "Maquette", type: "Figma", size: 0, url: figmaLink(key), figma: { pages: ["0:1", "0:2"], versionId: "102", receipt } } });
  return { owner, org, key, agencyAccount: { id: `fig-${handle}`, handle }, deliverableId: made.json.id as number };
}

/** The file's comments: a client's thread with replies, and what must stay in Figma. */
function comments(agencyAccount: { id: string; handle: string }): StandInComment[] {
  return [
    { id: "c1", message: "Agrandir le logo", created_at: "2026-10-22T09:00:00Z", user: marie, client_meta: on("1:1"), order_id: 1 },
    { id: "c1r1", parent_id: "c1", message: "On regarde", created_at: "2026-10-22T09:05:00Z", user: bruno },
    { id: "c1r2", parent_id: "c1", message: "Merci !", created_at: "2026-10-22T09:06:00Z", user: marie },
    // On « Brouillons », left out of the review.
    { id: "c2", message: "Test sur la page brouillon", created_at: "2026-10-22T09:10:00Z", user: marie, client_meta: on("3:1"), order_id: 2 },
    // The agency's own account.
    { id: "c3", message: "Penser à exporter", created_at: "2026-10-22T09:11:00Z", user: agencyAccount, client_meta: on("1:1"), order_id: 3 },
    // Resolved before it came in.
    { id: "c4", message: "Couleur du bouton", created_at: "2026-10-22T09:12:00Z", resolved_at: "2026-10-22T10:00:00Z", user: marie, client_meta: on("2:1"), order_id: 4 },
    // On the canvas, outside any screen: its page is not known, it comes in.
    { id: "c5", message: "Ajouter une page Équipe", created_at: "2026-10-22T09:13:00Z", user: paul, client_meta: { x: 900, y: 40 }, order_id: 5 },
    // Someone of the studio, not marked as the team yet.
    { id: "c6", message: "Note pour l’équipe : vérifier les marges", created_at: "2026-10-22T09:14:00Z", user: bruno, client_meta: on("2:1"), order_id: 6 },
  ];
}

const imported = (org: string) =>
  sql<{ id: string; deliverable_id: string; data: Record<string, unknown> }>("select id, deliverable_id, data from comments where organization_id = $1 and data ? 'figma' order by id", [org]);
const figmaIds = async (org: string) => (await imported(org)).map((row) => (row.data.figma as { commentId: string }).commentId).sort();
const bringIn = (member: Member, deliverableId: number) => call(`/api/deliverables/${deliverableId}/figma-import`, { person: member, body: {} });

test("opening a « Figma » deliverable brings its client's comments in; the team, resolved threads and left-out pages stay in Figma", async ({ browser }) => {
  const { owner, org, key, agencyAccount, deliverableId } = await figmaReview();
  await setFigmaComments(key, comments(agencyAccount));

  const { page, errors } = await newPerson(browser);
  await signInPage(page, owner.email);
  await page.goto(`/projets/7/livrables/${deliverableId}`);
  const board = page.getByRole("region", { name: "Tableau Figma" });
  await expect(board.getByRole("heading", { name: "3 demandes reçues de Figma" })).toBeVisible();
  expect(await figmaIds(org)).toEqual(["c1", "c5", "c6"]);

  // The client's words, signed with Figma's name, its page, its source, its replies, a draft « À clarifier ».
  const rows = await imported(org);
  const logo = rows.find((row) => (row.data.figma as { commentId: string }).commentId === "c1")!.data;
  expect(logo).toMatchObject({
    author: "Marie Client",
    from: "client",
    message: "Agrandir le logo",
    location: "Figma · Accueil",
    decision: "À qualifier",
    source: { channel: "figma", receivedAt: "2026-10-22" },
    figma: { commentId: "c1", authorId: "u-marie", orderId: 1, pageId: "0:1", url: `https://www.figma.com/design/${key}?node-id=1-1#c1` },
  });
  expect((logo.replies as Record<string, unknown>[]).map((reply) => [reply.author, reply.message])).toEqual([
    ["Bruno Studio", "On regarde"],
    ["Marie Client", "Merci !"],
  ]);
  expect(rows.find((row) => (row.data.figma as { commentId: string }).commentId === "c5")!.data.location).toBe("Figma");
  expect((await sql("select 1 from audit_events where organization_id = $1 and data->>'type' = 'comment.imported'", [org])).length).toBe(3);
  // The pages were read for the dialog, the round's screens once at the first import: no more.
  expect((await figmaReads(key)).file).toBe(2);

  // Bruno is of the studio: his draft leaves Kora, and his threads stay in Figma from now on.
  const people = board.getByRole("group", { name: "Personnes vues dans Figma" });
  // The box follows the server's answer: checked once the agency's setting is saved.
  await people.getByRole("checkbox", { name: /Bruno Studio/ }).click();
  await expect(people.getByRole("checkbox", { name: /Bruno Studio/ })).toBeChecked();
  await expect(board.getByRole("heading", { name: "2 demandes reçues de Figma" })).toBeVisible();
  expect(await figmaIds(org)).toEqual(["c1", "c5"]);

  // A new thread and a reply in Figma: « Actualiser » brings them in, once each.
  await setFigmaComments(key, [
    ...comments(agencyAccount),
    { id: "c1r3", parent_id: "c1", message: "Et le slogan aussi", created_at: "2026-10-22T11:00:00Z", user: marie },
    { id: "c7", message: "Le formulaire n’envoie rien", created_at: "2026-10-22T11:05:00Z", user: paul, client_meta: on("2:1"), order_id: 7 },
  ]);
  await expect(async () => {
    await board.getByRole("button", { name: "Actualiser" }).click();
    expect(await figmaIds(org)).toEqual(["c1", "c5", "c7"]);
  }).toPass();
  await expect(board.getByRole("heading", { name: "3 demandes reçues de Figma" })).toBeVisible();
  const logoAfter = (await imported(org)).find((row) => (row.data.figma as { commentId: string }).commentId === "c1")!.data;
  expect((logoAfter.replies as { message: string }[]).map((reply) => reply.message)).toEqual(["On regarde", "Merci !", "Et le slogan aussi"]);
  expect((await figmaReads(key)).file).toBe(2);
  expect(errors).toEqual([]);
});

test("a thread brought in from Figma is the agency's draft: the client sees it only once qualified, and acts on nothing before", async () => {
  const { owner, org, key, agencyAccount, deliverableId } = await figmaReview();
  await setFigmaComments(key, comments(agencyAccount));
  expect((await bringIn(owner, deliverableId)).json).toMatchObject({ imported: 3, replies: 2 });
  const token = unique("tok-figma");
  const linkKey = `${deliverableId}:1`;
  await seedState(owner, { maps: { reviewLinks: { upsert: { [linkKey]: { token, active: true, expiresAt: "01/01/2099", autoExpire: true, deliverableId, version: 1 } }, remove: [] } } });
  const email = `${unique("claire")}@client.test`;
  await call("/api/review-access/invite", { person: owner, body: { linkKey, emails: [email] } });
  const client = await verifiedClient(token, email);
  const seen = async () => ((await call(`/api/review/${token}`, { person: client })).json.state as { comments: { id: number; message: string }[] }).comments.map((comment) => comment.message);

  // Not qualified: nothing of it reaches the client, and acting on it answers as if it did not exist.
  expect(await seen()).toEqual([]);
  const logo = (await imported(org)).find((row) => (row.data.figma as { commentId: string }).commentId === "c1")!;
  expect((await clientAction(client, token, `comments/${logo.id}/replies`, "POST", { message: "Alors ?" })).status).toBe(404);

  // Qualified by the agency: the client sees it whole, with its replies and its source.
  expect((await call(`/api/comments/${logo.id}/qualification`, { method: "PUT", person: owner, body: { decision: "Inclus", title: "Logo plus grand" } })).status).toBe(200);
  const state = (await call(`/api/review/${token}`, { person: client })).json.state as { comments: Record<string, unknown>[] };
  expect(state.comments).toHaveLength(1);
  expect(state.comments[0]).toMatchObject({ title: "Logo plus grand", message: "Agrandir le logo", source: { channel: "figma" } });
  expect((state.comments[0].replies as unknown[]).length).toBe(2);
  // Words the client did not write in Kora are not theirs to change: neither the thread nor its replies from Figma.
  const replyId = (state.comments[0].replies as { id: number }[])[1].id;
  expect((await clientAction(client, token, `comments/${logo.id}`, "PATCH", { message: "Réécrit" })).status).toBeGreaterThanOrEqual(400);
  expect((await clientAction(client, token, `comments/${logo.id}/replies/${replyId}`, "PATCH", { message: "Réécrit" })).status).toBeGreaterThanOrEqual(400);
  expect((await clientAction(client, token, `comments/${logo.id}/replies/${replyId}`, "DELETE")).status).toBeGreaterThanOrEqual(400);
  const kept = (await imported(org)).find((row) => row.id === logo.id)!.data;
  expect(kept.message).toBe("Agrandir le logo");
  expect((kept.replies as { message: string }[]).map((reply) => reply.message)).toEqual(["On regarde", "Merci !"]);
  // The proof says whose words they are, as far as Kora knows.
  const proof = (await call(`/api/proof/${deliverableId}`, { person: owner })).json as { requests: { title: string; source: { line: string } | null }[] };
  expect(proof.requests.find((request) => request.title === "Logo plus grand")?.source?.line).toBe(
    "Demande reçue sur Figma le 22/10/2026 : commentaire de Marie Client (nom affiché par Figma, non vérifié par Kora), importé par Kora",
  );
  // Their own reply, written in Kora, is theirs.
  expect((await clientAction(client, token, `comments/${logo.id}/replies`, "POST", { message: "C’est noté" })).status).toBe(200);
});

test("bringing comments in: the current round only, read at most every few seconds, by the agency of the deliverable", async () => {
  const { owner, org, key, agencyAccount, deliverableId } = await figmaReview();
  await setFigmaComments(key, comments(agencyAccount));
  const member = await addColleague(owner, "Bruno Petit", "member");
  expect((await bringIn(member, deliverableId)).json).toMatchObject({ imported: 3 });
  // Asked again at once: Figma is not read again.
  expect((await bringIn(owner, deliverableId)).json).toMatchObject({ imported: 0, waited: true });

  // Another agency, a deliverable that is no « Figma », a team change that names no one: refused.
  const other = await signUp("Oscar Autre");
  await createAgency(other, "Studio Autre");
  expect((await bringIn(other, deliverableId)).status).toBe(404);
  await seedState(owner, { lists: { deliverables: { upsert: [{ id: 99, projectId: 7, name: "Cahier", type: "PDF", version: 1, status: "En attente client", importedAt: "x", locked: false, size: 1 }], remove: [] } } });
  expect((await bringIn(owner, 99)).status).toBe(404);
  expect((await call("/api/integrations/figma/team", { method: "PUT", person: owner, body: { figmaUserId: "u x", handle: "X", member: true } })).status).toBe(400);

  // A new round freezes the first: its threads stay with it, and it takes no new comment.
  const round = await call(`/api/deliverables/${deliverableId}/versions`, { person: owner, body: { type: "Figma", figma: { pages: ["0:1", "0:2"], versionId: "101" } } });
  expect(round.status).toBe(200);
  await setFigmaComments(key, [...comments(agencyAccount), { id: "c8", message: "Nouveau", created_at: "2026-10-23T09:00:00Z", user: paul, client_meta: on("1:1"), order_id: 8 }]);
  expect((await bringIn(owner, deliverableId)).status).toBe(409);
  await expect.poll(async () => (await bringIn(owner, round.json.id as number)).json.imported).toBe(1);
  const rows = await imported(org);
  expect(rows.filter((row) => Number(row.deliverable_id) === deliverableId).length).toBe(3);
  expect(rows.filter((row) => Number(row.deliverable_id) === round.json.id).map((row) => (row.data.figma as { commentId: string }).commentId)).toEqual(["c8"]);
});

test("when Figma will not show the round's screens, every page's comments come in, and Kora says so", async ({ browser }) => {
  const { owner, org, key, agencyAccount, deliverableId } = await figmaReview("Shallow");
  await setFigmaComments(key, comments(agencyAccount));
  const { page, errors } = await newPerson(browser);
  await signInPage(page, owner.email);
  await page.goto(`/projets/7/livrables/${deliverableId}`);
  const board = page.getByRole("region", { name: "Tableau Figma" });
  await expect(board.getByRole("note")).toContainText("Figma n’a pas laissé Kora lire les écrans de cette version");
  // « Brouillons » cannot be told apart: its comment comes in rather than a client's request being lost.
  await expect.poll(() => figmaIds(org)).toEqual(["c1", "c2", "c5", "c6"]);
  // The screens are not asked for again at each import (once an hour at most).
  const reads = (await figmaReads(key)).file;
  await expect.poll(async () => (await bringIn(owner, deliverableId)).json.waited).toBeUndefined();
  expect((await figmaReads(key)).file).toBe(reads);
  expect(errors).toEqual([]);
});

test("the client's page shows a qualified request from Figma with its words and where it came from", async ({ browser }) => {
  const { owner, org, key, agencyAccount, deliverableId } = await figmaReview();
  await setFigmaComments(key, comments(agencyAccount));
  await bringIn(owner, deliverableId);
  const logo = (await imported(org)).find((row) => (row.data.figma as { commentId: string }).commentId === "c1")!;
  await call(`/api/comments/${logo.id}/qualification`, { method: "PUT", person: owner, body: { decision: "Hors périmètre", title: "Logo animé" } });
  const token = unique("tok-figma");
  const linkKey = `${deliverableId}:1`;
  await seedState(owner, { maps: { reviewLinks: { upsert: { [linkKey]: { token, active: true, expiresAt: "01/01/2099", autoExpire: true, deliverableId, version: 1 } }, remove: [] } } });
  const email = `${unique("claire")}@client.test`;
  await call("/api/review-access/invite", { person: owner, body: { linkKey, emails: [email] } });
  const client = await verifiedClient(token, email);
  const { page, errors } = await newPerson(browser);
  const [name, value] = client.cookie.split(";")[0].split("=");
  await page.context().addCookies([{ name, value, url: baseURL }]);
  await page.goto(`/review/${token}`);
  const panel = page.getByRole("complementary", { name: "Vos retours" });
  await panel.getByRole("tab", { name: /Hors scope/ }).click();
  await panel.getByText("Logo animé").first().click();
  const thread = page.getByRole("dialog", { name: /Demande hors scope/ });
  // Where it came from: Figma, that day, nobody « entering » it; and the way back to it in Figma.
  const source = thread.getByRole("complementary", { name: "Source de la demande" });
  await expect(source).toHaveText(/^Demande reçue sur Figma le 22\/10\/2026Voir le commentaire dans Figma$/);
  await expect(source.getByRole("link", { name: "Voir le commentaire dans Figma" })).toHaveAttribute("href", `https://www.figma.com/design/${key}?node-id=1-1#c1`);
  await thread.getByRole("tab", { name: "Discussion" }).click();
  await expect(thread.getByText("Agrandir le logo")).toBeVisible();
  await expect(thread.getByText("On regarde")).toBeVisible();
  expect(errors).toEqual([]);
});

test("every member's connected Figma account is the agency's; a colleague takes a deliverable over when its maker's account is gone", async () => {
  const { owner, org, key, agencyAccount, deliverableId } = await figmaReview();
  const member = await addColleague(owner, "Bruno Petit", "member");
  const brunoHandle = await connectFigma(member);
  // Bruno's own comment, from his connected Figma account: the agency's, without ticking anything.
  await setFigmaComments(key, [...comments(agencyAccount), { id: "c9", message: "Revoir l’alignement", created_at: "2026-10-22T12:00:00Z", user: { id: `fig-${brunoHandle}`, handle: brunoHandle }, client_meta: on("1:1"), order_id: 9 }]);
  expect((await bringIn(owner, deliverableId)).status).toBe(200);
  expect(await figmaIds(org)).toEqual(["c1", "c5", "c6"]);
  const ownerOf = async () => ((await sql<{ value: Record<string, { ownerId?: string }> }>("select value from settings where organization_id = $1 and key = 'figmaImports'", [org]))[0]?.value ?? {})[String(deliverableId)]?.ownerId;
  const idOf = async (email: string) => (await sql<{ id: string }>("select id from users where email = $1", [email]))[0].id;
  expect(await ownerOf()).toBe(await idOf(owner.email));

  // Alice disconnects: Bruno brings the comments in with his own account, and the deliverable is his to read.
  // Her Figma account stays the agency's: her own comment (c3) still stays in Figma.
  await call("/api/integrations/figma", { method: "DELETE", person: owner });
  await setFigmaComments(key, [...comments(agencyAccount), { id: "c10", message: "Ajouter un pied de page", created_at: "2026-10-22T13:00:00Z", user: paul, client_meta: on("1:1"), order_id: 10 }]);
  await expect.poll(async () => (await bringIn(member, deliverableId)).json.imported).toBe(1);
  expect(await figmaIds(org)).toEqual(["c1", "c10", "c5", "c6"]);
  expect(await ownerOf()).toBe(await idOf(member.email));
  // Nobody of the agency connected any more: said so, nothing read.
  await call("/api/integrations/figma", { method: "DELETE", person: member });
  await expect.poll(async () => (await bringIn(owner, deliverableId)).json.code).toBe("FIGMA_NOT_CONNECTED");
});
