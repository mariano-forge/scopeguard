// Review links in the agency's editor, used as an administrator does: sharing creates the link,
// invitations are removed, the link is revoked, the client page is previewed, a validation reopened.

import { expect, test, type Browser } from "@playwright/test";
import { call, createAgency, newPerson, seedState, signInPage, signUp, sql, unique } from "./helpers";

/** `approved`: its version validated by the client, and locked; `other`: a second deliverable, validated too. */
async function editor(browser: Browser, { approved = false, other = false } = {}) {
  const alice = await signUp("Alice Martin");
  await createAgency(alice, "Studio Liens");
  const version = approved ? { status: "Approuvée", locked: true } : { status: "En attente client", locked: false };
  await seedState(alice, {
    lists: {
      clients: { upsert: [{ id: 1, name: "Northwind" }], remove: [] },
      projects: { upsert: [{ id: 1, name: "Refonte", clientId: 1, client: "Northwind", status: "En cours" }], remove: [] },
      deliverables: {
        upsert: [
          { id: 1, projectId: 1, name: "maquette.png", type: "Image", version: 1, ...version },
          ...(other ? [{ id: 2, projectId: 1, name: "logo.png", type: "Image", version: 1, status: "Approuvée", locked: true, importedAt: "14/10/2026" }] : []),
        ],
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
  await expect(page.locator("[data-page]").first()).toBeVisible();
  return { alice, org: alice.organizationId!, page, errors, writes };
}

const link = async (org: string) =>
  (await sql<{ token: string; active: boolean; data: { invites?: { email: string }[]; expiresAt?: string } }>("select token, active, data from review_links where organization_id = $1 and key = '1:1'", [org]))[0];

test("sharing creates the link; an invitation is removed; the link is revoked", async ({ browser }) => {
  const { org, page, errors, writes } = await editor(browser);
  await page.getByRole("button", { name: "Partager la revue" }).first().click();
  await expect(page.getByRole("dialog", { name: "Partager la revue" }).getByRole("button", { name: "Copier le lien" })).toBeVisible();
  // The deliverable is named plainly, not by its file name (a long one would fill the sentence).
  await expect(page.getByRole("dialog", { name: "Partager la revue" })).toContainText("Invitez vos clients à revoir ce livrable (V01)");
  await expect.poll(async () => (await link(org))?.active).toBe(true);
  const created = await link(org);
  expect(created.token).toMatch(/^[0-9a-f-]{36}$/);
  expect(created.data.expiresAt).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
  // Nobody invited yet: the dialog says the copied link will not open for anyone.
  const warning = page.getByRole("note").filter({ hasText: "Personne n’est encore invité" });
  await expect(warning).toBeVisible();

  const email = `${unique("claire")}@client.test`;
  await page.getByLabel("Inviter par e-mail").fill(email);
  await page.getByRole("button", { name: "Inviter", exact: true }).click();
  await expect.poll(async () => (await link(org)).data.invites?.map((invite) => invite.email)).toEqual([email]);
  await expect(warning).toHaveCount(0);
  await page.getByRole("button", { name: `Retirer ${email}` }).click();
  await expect.poll(async () => (await link(org)).data.invites?.length ?? 0).toBe(0);
  await expect(warning).toBeVisible();

  // Several at once: each address typed (or pasted) becomes a chip; a wrong one shows, and stops the sending.
  const [lea, max] = [unique("lea"), unique("max")].map((name) => `${name}@client.test`);
  const field = page.getByLabel("Inviter par e-mail");
  await field.fill(`${lea} pas-une-adresse, `);
  await expect(page.locator(".email-chip")).toHaveText([lea, "pas-une-adresse"]);
  await expect(page.locator(".email-chip.is-invalid")).toHaveText("pas-une-adresse");
  await page.getByRole("button", { name: "Inviter", exact: true }).click();
  await expect(page.getByText("Adresse invalide : pas-une-adresse")).toBeVisible();
  await page.getByRole("button", { name: "Retirer pas-une-adresse de la liste" }).click();
  await field.fill(max);
  await field.press("Enter");
  await expect.poll(async () => (await link(org)).data.invites?.map((invite) => invite.email).sort()).toEqual([lea, max].sort());
  await expect(page.locator(".email-chip")).toHaveCount(0);
  await expect(page.getByRole("list", { name: "Personnes invitées" }).getByRole("listitem")).toHaveCount(2);

  await page.getByRole("button", { name: "Révoquer ce lien" }).click();
  await expect.poll(async () => (await link(org)).active).toBe(false);

  // Sharing again: a new active link for the version.
  await page.getByRole("button", { name: "Partager la revue" }).first().click();
  await expect.poll(async () => (await link(org)).active).toBe(true);
  expect((await link(org)).token).not.toBe(created.token);
  expect(writes.filter((write) => write === "PATCH /api/state")).toEqual([]);
  expect(errors).toEqual([]);
});

test("the reminder goes to the deciders and says so; with none, it waits for one", async ({ browser }) => {
  const { alice, page, errors } = await editor(browser);
  const [decider, contributor] = [`${unique("claire")}@client.test`, `${unique("paul")}@client.test`];
  await page.getByRole("button", { name: "Partager la revue" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Partager la revue" });
  await expect(dialog.getByLabel("Inviter par e-mail")).toBeVisible();
  // A contributor only: nothing to remind them of (deciding is the deciders').
  expect((await call("/api/review-access/invite", { method: "POST", person: alice, body: { linkKey: "1:1", emails: [contributor], role: "contributor" } })).status).toBe(200);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Partager la revue" }).first().click();
  await expect(dialog.getByRole("button", { name: "Relancer le client" })).toBeDisabled();
  // A decider: reminded, and named.
  expect((await call("/api/review-access/invite", { method: "POST", person: alice, body: { linkKey: "1:1", emails: [decider] } })).status).toBe(200);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Partager la revue" }).first().click();
  await dialog.getByRole("button", { name: "Relancer le client" }).click();
  // The decider only: the contributor is not reminded, and not counted.
  await expect(page.getByText(`Relance envoyée à ${decider}`)).toBeVisible();
  await expect(page.getByText(/Relance envoyée à 2 personnes/)).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: /Relance déjà envoyée/ })).toBeDisabled();
  expect(errors).toEqual([]);
});

test("after a revocation, the link copied from the reopened dialog is the new one, never the revoked one", async ({ browser }) => {
  const { org, page, errors } = await editor(browser);
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByRole("button", { name: "Partager la revue" }).first().click();
  await expect.poll(async () => (await link(org))?.active).toBe(true);
  const revoked = (await link(org)).token;
  await page.getByRole("button", { name: "Révoquer ce lien" }).click();
  await expect.poll(async () => (await link(org)).active).toBe(false);
  await expect(page.getByRole("dialog", { name: "Partager la revue" })).toHaveCount(0);
  await page.getByRole("button", { name: "Partager la revue" }).first().click();
  await page.getByRole("dialog", { name: "Partager la revue" }).getByRole("button", { name: "Copier le lien" }).click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).not.toContain(revoked);
  await expect.poll(async () => (await link(org)).active).toBe(true);
  expect(copied).toContain((await link(org)).token);
  expect(errors).toEqual([]);
});

test("a version with no decider says so at the top of the canvas, and a decider is invited from there", async ({ browser }) => {
  const { org, page, errors } = await editor(browser);
  const alert = page.getByRole("region", { name: "Canevas" }).getByRole("status").filter({ hasText: "Aucun décideur sur cette version" });
  await expect(alert).toHaveText(/^Aucun décideur sur cette versionInviter un décideur$/);
  // An announcement across the top of the canvas, on one line.
  const [bar, canvasBox] = [(await alert.boundingBox())!, (await page.getByRole("region", { name: "Canevas" }).boundingBox())!];
  expect(bar.height).toBeLessThan(48);
  expect(Math.round(bar.width)).toBe(Math.round(canvasBox.width));
  expect(Math.round(bar.y)).toBe(Math.round(canvasBox.y));
  await alert.getByRole("button", { name: "Inviter un décideur" }).click();
  const dialog = page.getByRole("dialog", { name: "Partager la revue" });
  const email = `${unique("decideur")}@client.test`;
  await dialog.getByLabel("Inviter par e-mail").fill(email);
  await dialog.getByRole("button", { name: "Inviter", exact: true }).click();
  await expect.poll(async () => (await link(org))?.data.invites?.map((invite) => invite.email)).toEqual([email]);
  await page.keyboard.press("Escape");
  // A decider now: the alert is gone.
  await expect(alert).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("the no-decider alert, once closed, stays closed for that version", async ({ browser }) => {
  const { page, errors } = await editor(browser);
  const alert = page.getByRole("status").filter({ hasText: "Aucun décideur sur cette version" });
  await alert.getByRole("button", { name: "Fermer l’alerte" }).click();
  await expect(alert).toHaveCount(0);
  await page.reload();
  await expect(page.locator("[data-page]").first()).toBeVisible();
  await expect(alert).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("the client preview opens the client page of a link created for it; a member opening it reads it, without the space or project", async ({ browser }) => {
  const { org, page, errors, writes } = await editor(browser);
  // The button of the requests panel: the client page, in a new tab, on the version's link.
  const [preview] = await Promise.all([page.context().waitForEvent("page"), page.getByRole("button", { name: "Aperçu client" }).click()]);
  await expect.poll(async () => (await link(org))?.token).toBeTruthy();
  expect(new URL(preview.url()).pathname).toBe(`/review/${(await link(org)).token}`);
  await expect(preview.getByRole("heading", { name: "maquette.png" })).toBeVisible();
  await expect(preview.getByRole("button", { name: "Valider cette version" })).toHaveCount(0);
  await preview.close();
  expect(writes.filter((write) => write === "PATCH /api/state")).toEqual([]);
  // Only the button: the deliverable's menu has no preview.
  await page.getByRole("button", { name: "Actions du livrable maquette.png" }).click();
  await expect(page.getByRole("menuitem", { name: "Partager la revue" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Aperçu client" })).toHaveCount(0);
  await page.keyboard.press("Escape");

  // Signed in to Kora, the member who opens a link still only reads it; the page names the deliverable alone.
  await page.getByRole("button", { name: "Partager la revue" }).first().click();
  await expect.poll(async () => (await link(org))?.active).toBe(true);
  await page.goto(`/review/${(await link(org)).token}`);
  await expect(page.getByRole("heading", { name: "maquette.png" })).toBeVisible();
  await expect(page.getByText("Aperçu de l’organisation")).toHaveCount(0);
  await expect(page.getByText(/Northwind|Refonte/)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Valider cette version" })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("a version not validated yet has no validation to reopen: the menu says so, the server refuses it", async ({ browser }) => {
  const { alice, page, errors } = await editor(browser);
  await page.getByRole("button", { name: "Actions du livrable maquette.png" }).click();
  await expect(page.getByRole("menuitem", { name: "Rouvrir la validation" })).toBeDisabled();
  const refused = await call("/api/deliverables/1/reopen", { method: "POST", person: alice, body: { message: "Encore" } });
  expect(refused.status).toBe(409);
  expect(errors).toEqual([]);
});

test("« Historique & journal » tells this deliverable's versions and events, none of another's", async ({ browser }) => {
  const { alice, page, errors } = await editor(browser, { approved: true, other: true });
  // An event of each deliverable.
  expect((await call("/api/deliverables/1/reopen", { method: "POST", person: alice, body: { message: "Marges" } })).status).toBe(200);
  expect((await call("/api/deliverables/2/reopen", { method: "POST", person: alice, body: { message: "Couleurs du logo" } })).status).toBe(200);
  await page.reload();
  await page.getByRole("button", { name: "Actions du livrable maquette.png" }).click();
  await page.getByRole("menuitem", { name: "Historique & journal" }).click();
  const history = page.getByRole("dialog", { name: "Historique & journal" });
  await expect(history.locator(".version-row")).toHaveCount(1);
  await expect(history.locator(".version-row")).toContainText("maquette.png");
  await expect(history).toContainText("« Marges »");
  await expect(history).not.toContainText("Couleurs du logo");
  await expect(history).not.toContainText("logo.png");
  expect(errors).toEqual([]);
});

test("a version's validation is reopened, with the reason in the trail", async ({ browser }) => {
  const { org, page, errors, writes } = await editor(browser, { approved: true });
  await page.getByRole("button", { name: "Actions du livrable maquette.png" }).click();
  await page.getByRole("menuitem", { name: "Rouvrir la validation" }).click();
  await page.getByLabel("Message").fill("La hiérarchie du bloc principal doit être revue");
  await page.getByRole("button", { name: "Envoyer la demande" }).click();
  await expect.poll(async () => (await sql<{ review_status: string }>("select review_status from deliverables where organization_id = $1 and id = 1", [org]))[0].review_status).toBe(
    "changes-requested",
  );
  await expect
    .poll(async () => (await sql<{ description: string }>("select data->>'description' as description from audit_events where organization_id = $1 and type = 'review.reopened'", [org])).map((row) => row.description))
    .toEqual(["Validation rouverte par l’organisation : « La hiérarchie du bloc principal doit être revue »"]);
  expect(writes.filter((write) => write === "PATCH /api/state")).toEqual([]);
  expect(errors).toEqual([]);
});
