// The client review page, used as a client does: every action they can take ends up in the database,
// signed with their verified address, with its audit event and the agency's notification.

import { expect, test, type Browser } from "@playwright/test";
import { baseURL } from "../../playwright.config";
import { call, createAgency, newPerson, seedState, seedReview, signUp, sql, unique, verifiedClient } from "./helpers";

async function clientPage(browser: Browser) {
  const alice = await signUp("Alice Martin");
  await createAgency(alice, "Studio Revue");
  const token = unique("tok-ui");
  const { linkKey } = await seedReview(alice, token);
  const quote = (id: number, commentId: number, description: string) => [{ id, version: 1, commentId, description, amount: 900, deadline: 3, status: "sent", createdAt: "x" }];
  await seedState(alice, {
    lists: {
      comments: {
        upsert: [
          { id: 10, deliverableId: 1, author: "Alice Martin", initials: "AM", from: "agency", message: "Section témoignages", decision: "Hors périmètre", kind: "request", title: "Témoignages", location: "", time: "t" },
          { id: 11, deliverableId: 1, author: "Alice Martin", initials: "AM", from: "agency", message: "Page contact", decision: "Hors périmètre", kind: "request", title: "Formulaire de contact", location: "", time: "t" },
          // A question still to clarify: validating gives it up.
          { id: 12, deliverableId: 1, author: "Alice Martin", initials: "AM", from: "agency", message: "Quelle police pour les titres ?", decision: "À qualifier", kind: "remark", location: "", time: "t" },
        ],
        remove: [],
      },
    },
    maps: {
      proposalStates: { upsert: { "10": "sent", "11": "sent" }, remove: [] },
      proposalVersions: { upsert: { "10": quote(100, 10, "Témoignages"), "11": quote(110, 11, "Formulaire de contact") }, remove: [] },
    },
  });
  const email = `${unique("claire")}@client.test`;
  await call("/api/review-access/invite", { person: alice, body: { linkKey, emails: [email] } });
  const client = await verifiedClient(token, email, "Claire Dubois");

  const { page, errors } = await newPerson(browser);
  const [name, value] = client.cookie.split(";")[0].split("=");
  await page.context().addCookies([{ name, value, url: baseURL }]);
  const writes: string[] = [];
  page.on("request", (request) => {
    if (request.method() !== "GET" && request.url().includes("/api/review/")) writes.push(`${request.method()} ${new URL(request.url()).pathname.replace(token, ":token")}`);
  });
  await page.goto(`/review/${token}`);
  await expect(page.getByRole("button", { name: "Valider cette version" })).toBeVisible();
  return { org: alice.organizationId!, email, page, errors, writes };
}

const commentsOf = (org: string) =>
  sql<{ id: string; data: Record<string, unknown> }>("select id, data from comments where organization_id = $1 and data->>'from' = 'client' order by id", [org]);
const eventsOf = (org: string, type: string) => sql<{ actor: string; recorded_by: string }>("select data->>'actor' as actor, recorded_by from audit_events where organization_id = $1 and data->>'type' = $2", [org, type]);
const notificationsOf = async (org: string) => (await sql<{ message: string }>("select data->>'message' as message from notifications where organization_id = $1", [org])).map((row) => row.message);

test("the client comments, replies, edits and deletes on the page; the server signs each write", async ({ browser }) => {
  const { org, email, page, errors, writes } = await clientPage(browser);

  // A comment on the deliverable: click the page, write, publish.
  await page.locator("[data-page]").first().click({ position: { x: 120, y: 90 } });
  await page.getByRole("textbox", { name: "Commentaire" }).fill("Le logo est trop petit");
  await page.getByRole("button", { name: "Publier" }).click();
  await expect.poll(async () => (await commentsOf(org)).map((row) => row.data.message)).toEqual(["Le logo est trop petit"]);
  const [created] = await commentsOf(org);
  expect(created.data).toMatchObject({ author: "Claire Dubois", initials: "CD", from: "client", authorEmail: email, decision: "À qualifier", page: 1 });
  expect((created.data.position as { x: number }).x).toBeGreaterThan(0);
  await expect.poll(async () => (await eventsOf(org, "comment.created")).map((event) => event.recorded_by)).toEqual([`client:${email}`]);

  // The thread is open: a reply.
  await page.getByRole("textbox", { name: "Répondre" }).fill("Surtout sur mobile");
  await page.getByRole("button", { name: "Envoyer la réponse" }).click();
  await expect.poll(async () => ((await commentsOf(org))[0].data.replies as { message: string }[] | undefined)?.map((reply) => reply.message)).toEqual(["Surtout sur mobile"]);
  expect(((await commentsOf(org))[0].data.replies as Record<string, unknown>[])[0]).toMatchObject({ author: "Claire Dubois", from: "client", authorEmail: email });

  // Its own comment, edited.
  await page.getByRole("button", { name: "Modifier le message" }).first().click();
  await page.getByRole("textbox", { name: "Modifier le message" }).fill("Le logo est beaucoup trop petit");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect.poll(async () => (await commentsOf(org))[0].data).toMatchObject({ message: "Le logo est beaucoup trop petit", edited: true });

  // Its reply, deleted; then the comment.
  // The reply is shown before its own delete button is used.
  await expect(page.locator(".thread-text", { hasText: "Surtout sur mobile" })).toBeVisible();
  await page.getByRole("button", { name: "Supprimer le message" }).last().click();
  await expect.poll(async () => ((await commentsOf(org))[0].data.replies as unknown[] | undefined)?.length ?? 0).toBe(0);
  await page.getByRole("button", { name: "Supprimer", exact: true }).click();
  await expect.poll(async () => (await commentsOf(org)).length).toBe(0);
  // One request per action, never the whole state.
  expect(writes).toEqual([
    "POST /api/review/:token/comments",
    expect.stringMatching(/^POST \/api\/review\/:token\/comments\/\d+\/replies$/),
    expect.stringMatching(/^PATCH \/api\/review\/:token\/comments\/\d+$/),
    expect.stringMatching(/^DELETE \/api\/review\/:token\/comments\/\d+\/replies\/\d+$/),
    expect.stringMatching(/^DELETE \/api\/review\/:token\/comments\/\d+$/),
  ]);
  expect(errors).toEqual([]);
});

test("the client accepts one quote, asks to adapt another, decides it when validating, then approves", async ({ browser }) => {
  const { org, email, page, errors, writes } = await clientPage(browser);
  await page.getByRole("tab", { name: /Hors scope/ }).click();

  const open = async (title: string) => {
    await page.locator(".client-side-panel li.inspector-row").filter({ hasText: title }).getByRole("button", { name: "Voir la proposition" }).click();
  };
  await open("Témoignages");
  await page.getByRole("button", { name: "Accepter" }).click();
  await expect.poll(async () => (await sql<{ decision: string }>("select decision from comment_proposals where organization_id = $1 and comment_id = 10", [org]))[0]?.decision).toBe("accepted");
  const [quote] = await sql<{ data: { status: string } }>("select data from proposal_versions where organization_id = $1 and comment_id = 10", [org]);
  expect(quote.data.status).toBe("accepted");
  await expect.poll(async () => (await eventsOf(org, "proposal.decision")).map((event) => [event.actor, event.recorded_by])).toEqual([["Claire Dubois", `client:${email}`]]);
  await expect.poll(() => notificationsOf(org)).toContainEqual(expect.stringContaining("acceptée"));

  await open("Formulaire de contact");
  await page.getByRole("button", { name: "Faire une contre-proposition" }).click();
  await page.getByLabel("Votre demande").fill("Seulement le formulaire, sans carte");
  await page.getByRole("button", { name: "Envoyer la demande" }).click();
  await expect
    .poll(async () => (await sql<{ adaptation: { message: string } | null }>("select adaptation from comment_proposals where organization_id = $1 and comment_id = 11", [org]))[0]?.adaptation?.message)
    .toBe("Seulement le formulaire, sans carte");
  await expect.poll(async () => (await eventsOf(org, "proposal.adaptation-requested")).length).toBe(1);

  // The quote under a counter-proposal still waits: decided from the validation dialog first.
  await page.getByRole("button", { name: "Valider cette version" }).click();
  const waiting = page.getByRole("list", { name: "Propositions en attente de votre décision" });
  await expect(waiting.getByRole("listitem")).toHaveCount(1);
  await expect(waiting).toContainText("Formulaire de contact");
  const confirm = page.getByRole("button", { name: "Valider et renoncer à ces remarques" });
  await expect(confirm).toBeDisabled();
  await waiting.getByRole("button", { name: "Refuser « Formulaire de contact »" }).click();
  await expect(waiting).toHaveCount(0);
  await expect.poll(async () => (await sql<{ decision: string }>("select decision from comment_proposals where organization_id = $1 and comment_id = 11", [org]))[0]?.decision).toBe("refused");
  // The remark still to clarify: named, and given up knowingly.
  await expect(page.getByRole("note").filter({ hasText: "Certaines remarques n’ont pas encore été clarifiées" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Remarques auxquelles vous renoncez" })).toContainText("Quelle police pour les titres ?");
  await confirm.click();
  await expect(page.getByRole("status").filter({ hasText: "Validée" })).toBeVisible();
  await expect.poll(async () => (await sql<{ review_status: string; locked: boolean }>("select review_status, locked from deliverables where organization_id = $1 and id = 1", [org]))[0]).toEqual({
    review_status: "approved",
    locked: true,
  });
  await expect.poll(async () => (await eventsOf(org, "deliverable.approved")).map((event) => event.recorded_by)).toEqual([`client:${email}`]);
  const [approval] = await sql<{ description: string }>("select data->>'description' as description from audit_events where organization_id = $1 and type = 'deliverable.approved'", [org]);
  expect(approval.description).toBe("Version 1 approuvée par le client ; remarque abandonnée : « Quelle police pour les titres ? »");
  await expect.poll(() => notificationsOf(org)).toContainEqual(expect.stringContaining("approuvé la version 1"));

  expect(writes).toEqual([
    "POST /api/review/:token/proposals/10/decision",
    "POST /api/review/:token/proposals/11/adaptation",
    "POST /api/review/:token/proposals/11/decision",
    "POST /api/review/:token/approval",
  ]);

  // Read-only from now on.
  await page.reload();
  await expect(page.getByRole("button", { name: "Valider cette version" })).toHaveCount(0);
  await expect(page.getByText("Vous avez validé cette version")).toBeVisible();
  expect(errors).toEqual([]);
});
