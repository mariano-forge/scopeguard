// Quotes in the agency's editor, used as an administrator does: send a draft, answer a
// counter-proposal, quote again after a refusal, send a new version. Each step ends up in the
// database with its audit event.

import { expect, test, type Browser, type Page } from "@playwright/test";
import { call, createAgency, mailsTo, newPerson, seedState, signInPage, signUp, sql, unique } from "./helpers";

const quote = (commentId: number, status: string, extra: Record<string, unknown> = {}) => ({ id: commentId * 10, version: 1, commentId, description: `Devis ${commentId}`, amount: 900, deadline: 3, status, createdAt: "x", ...extra });
const request = (id: number, title: string) => ({
  id,
  deliverableId: 1,
  author: "Alice Martin",
  initials: "AM",
  from: "agency",
  message: title,
  title,
  decision: "Hors périmètre",
  kind: "request",
  location: "Page 1",
  page: 1,
  position: { x: 10 + (id - 30) * 15, y: 20 },
  time: "t",
});

/** The editor of a version shared with a decider (who receives the proposals), or with a contributor only. */
async function editor(browser: Browser, role: "decider" | "contributor" = "decider", others: string[] = []) {
  const alice = await signUp("Alice Martin");
  const decider = `${unique("claire")}@northwind.test`;
  await createAgency(alice, "Studio Devis");
  await seedState(alice, {
    lists: {
      clients: { upsert: [{ id: 1, name: "Northwind" }], remove: [] },
      projects: { upsert: [{ id: 1, name: "Refonte", clientId: 1, client: "Northwind", status: "En cours" }], remove: [] },
      deliverables: { upsert: [{ id: 1, projectId: 1, name: "maquette.png", type: "Image", version: 1, status: "En attente client", locked: false }], remove: [] },
      comments: { upsert: [request(31, "Blog"), request(32, "Carte"), request(33, "Vidéo"), request(34, "Newsletter")], remove: [] },
    },
    maps: {
      reviewLinks: {
        upsert: { "1:1": { token: unique("tok-devis"), active: true, expiresAt: "01/01/2099", autoExpire: true, deliverableId: 1, version: 1, invites: [{ email: decider, at: "14/10/2026 10:00", role }, ...others.map((email) => ({ email, at: "14/10/2026 10:00", role: "decider" }))] } },
        remove: [],
      },
      proposalStates: { upsert: { "31": "draft", "32": "sent", "33": "sent", "34": "sent" }, remove: [] },
      proposalDecisions: { upsert: { "33": "refused" }, remove: [] },
      adaptationRequests: { upsert: { "32": { message: "Moins cher ?", budget: 600, requestedAt: "x" } }, remove: [] },
      proposalVersions: {
        upsert: { "31": [quote(31, "draft", { allowCounter: true })], "32": [quote(32, "sent", { allowCounter: true })], "33": [quote(33, "refused")], "34": [quote(34, "sent")] },
        remove: [],
      },
    },
  });
  const { page, errors } = await newPerson(browser);
  const writes: string[] = [];
  page.on("request", (sent) => {
    if (sent.method() !== "GET" && sent.url().includes("/api/") && !sent.url().includes("/api/auth/")) writes.push(`${sent.method()} ${new URL(sent.url()).pathname}`);
  });
  await signInPage(page, alice.email);
  await page.goto("/projets/1/livrables/1");
  await expect(page.locator('[data-pin="31"]')).toBeVisible();
  return { alice, decider, org: alice.organizationId!, page, errors, writes };
}

/** The open thread's bubble (the side panel shows the same buttons). */
const thread = (page: Page) => page.getByRole("dialog", { name: /^Demande hors scope/ });

const proposal = async (org: string, id: number) =>
  (await sql<{ state: string; decision: string | null; adaptation: Record<string, unknown> | null }>("select state, decision, adaptation from comment_proposals where organization_id = $1 and comment_id = $2", [org, id]))[0];
const versions = async (org: string, id: number) =>
  (await sql<{ data: Record<string, unknown> }>("select data from proposal_versions where organization_id = $1 and comment_id = $2 order by position", [org, id])).map((row) => row.data);
const events = async (org: string, id: number) =>
  (await sql<{ type: string }>("select type from audit_events where organization_id = $1 and comment_id = $2 order by id", [org, id])).map((row) => row.type);

test("an administrator sends a drafted quote, after confirming it", async ({ browser }) => {
  const { org, page, errors, writes, decider } = await editor(browser);
  await page.locator('[data-pin="31"]').click();
  await thread(page).getByRole("button", { name: "Envoyer la proposition" }).click();
  // Who is told by e-mail: the version's decider, not the space; folded at the foot of the dialog.
  const confirm = page.getByRole("alertdialog");
  const notify = confirm.getByRole("button", { name: /Prévenir par e-mail/ });
  await expect(notify).toHaveAttribute("aria-expanded", "false");
  await expect(notify).toContainText("1 décideur");
  await expect(confirm.getByRole("checkbox")).toHaveCount(0);
  await notify.click();
  await expect(confirm.getByRole("checkbox", { name: decider })).toBeChecked();
  await expect(confirm).not.toContainText("Northwind");
  await confirm.getByRole("button", { name: "Envoyer la proposition" }).click();
  await expect.poll(async () => (await proposal(org, 31))?.state).toBe("sent");
  expect(await versions(org, 31)).toEqual([expect.objectContaining({ id: 310, status: "sent", amount: 900, allowCounter: true })]);
  await expect.poll(() => events(org, 31)).toEqual(["proposal.sent"]);
  expect(writes.filter((write) => write === "PATCH /api/state")).toEqual([]);
  expect(errors).toEqual([]);
});

test("the agency chooses which deciders are told by e-mail, all by default; never anyone else", async ({ browser }) => {
  const other = `${unique("marc")}@northwind.test`;
  const { alice, org, page, errors, decider } = await editor(browser, "decider", [other]);
  await page.locator('[data-pin="31"]').click();
  await thread(page).getByRole("button", { name: "Envoyer la proposition" }).click();
  const confirm = page.getByRole("alertdialog");
  await expect(confirm.getByRole("button", { name: /Prévenir par e-mail/ })).toContainText("2 décideurs");
  await confirm.getByRole("button", { name: /Prévenir par e-mail/ }).click();
  await expect(confirm.getByRole("checkbox", { name: decider })).toBeChecked();
  await confirm.getByRole("checkbox", { name: other }).click();
  await expect(confirm.getByRole("button", { name: /Prévenir par e-mail/ })).toContainText("1 décideur sur 2");
  await confirm.getByRole("button", { name: "Envoyer la proposition" }).click();
  await expect.poll(async () => (await proposal(org, 31))?.state).toBe("sent");
  await expect.poll(() => mailsTo(decider).length).toBe(1);
  expect(mailsTo(other)).toHaveLength(0);

  // The server only narrows the deciders: an address that is not one is never written to.
  const stranger = `${unique("intrus")}@ailleurs.test`;
  await seedState(alice, { maps: { proposalStates: { upsert: { "31": "draft" }, remove: [] }, proposalVersions: { upsert: { "31": [quote(31, "draft")] }, remove: [] } } });
  expect((await call("/api/comments/31/proposal/send", { method: "POST", person: alice, body: { notify: [stranger, other] } })).status).toBe(200);
  await expect.poll(() => mailsTo(other).length).toBe(1);
  expect(mailsTo(stranger)).toHaveLength(0);
  expect(errors).toEqual([]);
});

test("an administrator accepts the client's counter-proposal", async ({ browser }) => {
  const { org, page, errors, writes } = await editor(browser);
  await page.locator('[data-pin="32"]').click();
  await thread(page).getByRole("button", { name: "Répondre à l’adaptation" }).click();
  await page.getByRole("button", { name: "Accepter l’adaptation" }).click();
  await expect.poll(async () => (await proposal(org, 32))?.adaptation).toMatchObject({ message: "Moins cher ?", budget: 600, decision: "accepted", decisionBy: "Alice Martin" });
  await expect.poll(() => events(org, 32)).toEqual(["proposal.adaptation-decision"]);
  expect(writes.filter((write) => write === "PATCH /api/state")).toEqual([]);
  expect(errors).toEqual([]);
});

test("after a refusal, an administrator quotes again: the refused quote stays, the new one waits to be sent", async ({ browser }) => {
  const { org, page, errors, writes } = await editor(browser);
  await page.locator('[data-pin="33"]').click();
  await thread(page).getByRole("button", { name: "Proposition refusée · voir" }).click();
  await page.getByRole("button", { name: "Faire une nouvelle proposition" }).click();
  await page.getByLabel("Montant HT").fill("700");
  await page.getByRole("button", { name: "Enregistrer le chiffrage" }).click();
  await expect.poll(async () => (await versions(org, 33)).map((entry) => [entry.version, entry.status, entry.amount])).toEqual([
    [1, "refused", 900],
    [2, "draft", 700],
  ]);
  expect(await proposal(org, 33)).toMatchObject({ state: "draft" });
  expect([null, "none"]).toContain((await proposal(org, 33)).decision);
  await expect.poll(() => events(org, 33)).toEqual(["proposal.drafted"]);
  expect(writes.filter((write) => write === "PATCH /api/state")).toEqual([]);
  expect(errors).toEqual([]);
});

test("an administrator replaces a quote waiting for the client by a new version", async ({ browser }) => {
  const { org, page, errors, writes } = await editor(browser);
  await page.locator('[data-pin="34"]').click();
  await thread(page).getByRole("button", { name: "Voir la proposition envoyée" }).click();
  await page.getByRole("button", { name: "Modifier (nouvelle version)" }).click();
  await page.getByLabel("Montant HT").fill("1200");
  await page.getByRole("button", { name: "Envoyer la nouvelle proposition" }).click();
  await expect.poll(async () => (await versions(org, 34)).map((entry) => [entry.version, entry.status, entry.amount])).toEqual([
    [1, "superseded", 900],
    [2, "sent", 1200],
  ]);
  expect(await proposal(org, 34)).toMatchObject({ state: "sent" });
  await expect.poll(() => events(org, 34)).toEqual(["proposal.sent"]);
  expect(writes.filter((write) => write === "PATCH /api/state")).toEqual([]);
  expect(errors).toEqual([]);
});

test("with no decider invited on the version, a proposal is not sent: the dialog says so and offers to share the review", async ({ browser }) => {
  const { alice, org, page, errors } = await editor(browser, "contributor");
  await page.locator('[data-pin="31"]').click();
  await thread(page).getByRole("button", { name: "Envoyer la proposition" }).click();
  const confirm = page.getByRole("alertdialog");
  // A warning says why; « Envoyer » stays greyed out.
  await expect(confirm.getByRole("alert")).toContainText("Aucun décideur pour recevoir cette proposition");
  await expect(confirm.getByRole("button", { name: "Envoyer la proposition" })).toBeDisabled();
  // The server refuses it too.
  const refused = await call("/api/comments/31/proposal/send", { method: "POST", person: alice, body: {} });
  expect(refused.status).toBe(409);
  expect(refused.json.error).toContain("Aucun décideur");
  expect(await proposal(org, 31)).toMatchObject({ state: "draft" });
  expect(await events(org, 31)).toEqual([]);

  await confirm.getByRole("alert").getByRole("button", { name: "Partager la revue" }).click();
  await expect(confirm).toHaveCount(0);
  await expect(page.getByRole("dialog", { name: "Partager la revue" })).toBeVisible();
  expect(errors).toEqual([]);
});
