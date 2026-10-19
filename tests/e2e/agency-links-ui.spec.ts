// Review links in the agency's editor, used as an administrator does: sharing creates the link,
// invitations are removed, the link is revoked, no client preview, a validation reopened.

import { expect, test, type Browser } from "@playwright/test";
import { createAgency, newPerson, seedState, signInPage, signUp, sql, unique } from "./helpers";

async function editor(browser: Browser) {
  const alice = await signUp("Alice Martin");
  await createAgency(alice, "Studio Liens");
  await seedState(alice, {
    lists: {
      clients: { upsert: [{ id: 1, name: "Northwind" }], remove: [] },
      projects: { upsert: [{ id: 1, name: "Refonte", clientId: 1, client: "Northwind", status: "En cours" }], remove: [] },
      deliverables: { upsert: [{ id: 1, projectId: 1, name: "maquette.png", type: "Image", version: 1, status: "En attente client", locked: false }], remove: [] },
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
  return { org: alice.organizationId!, page, errors, writes };
}

const link = async (org: string) =>
  (await sql<{ token: string; active: boolean; data: { invites?: { email: string }[]; expiresAt?: string } }>("select token, active, data from review_links where organization_id = $1 and key = '1:1'", [org]))[0];

test("sharing creates the link; an invitation is removed; the link is revoked", async ({ browser }) => {
  const { org, page, errors, writes } = await editor(browser);
  await page.getByRole("button", { name: "Partager la revue" }).first().click();
  await expect(page.getByText("Lien actif")).toBeVisible();
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

  await page.getByRole("button", { name: "Révoquer ce lien" }).click();
  await expect.poll(async () => (await link(org)).active).toBe(false);

  // Sharing again: a new active link for the version.
  await page.getByRole("button", { name: "Partager la revue" }).first().click();
  await expect.poll(async () => (await link(org)).active).toBe(true);
  expect((await link(org)).token).not.toBe(created.token);
  expect(writes.filter((write) => write === "PATCH /api/state")).toEqual([]);
  expect(errors).toEqual([]);
});

test("no client preview in the editor; a member opening the client link reads it, without the space or project", async ({ browser }) => {
  const { org, page, errors } = await editor(browser);
  await expect(page.getByRole("button", { name: "Partager la revue" }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Aperçu client" })).toHaveCount(0);
  await page.getByRole("button", { name: "Actions du livrable maquette.png" }).click();
  await expect(page.getByRole("menuitem", { name: "Partager la revue" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Aperçu client" })).toHaveCount(0);
  await page.keyboard.press("Escape");

  // Signed in to Kora, the member who opens a link still only reads it; the page names the deliverable alone.
  await page.getByRole("button", { name: "Partager la revue" }).first().click();
  await expect.poll(async () => (await link(org))?.active).toBe(true);
  await page.goto(`/review/${(await link(org)).token}`);
  await expect(page.getByRole("heading", { name: "maquette.png" })).toBeVisible();
  await expect(page.getByText("Aperçu agence")).toHaveCount(0);
  await expect(page.getByText(/Northwind|Refonte/)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Valider cette version" })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("a version's validation is reopened, with the reason in the trail", async ({ browser }) => {
  const { org, page, errors, writes } = await editor(browser);
  await page.getByRole("button", { name: "Actions du livrable maquette.png" }).click();
  await page.getByRole("menuitem", { name: "Rouvrir la validation" }).click();
  await page.getByLabel("Message").fill("La hiérarchie du bloc principal doit être revue");
  await page.getByRole("button", { name: "Envoyer la demande" }).click();
  await expect.poll(async () => (await sql<{ review_status: string }>("select review_status from deliverables where organization_id = $1 and id = 1", [org]))[0].review_status).toBe(
    "changes-requested",
  );
  await expect
    .poll(async () => (await sql<{ description: string }>("select data->>'description' as description from audit_events where organization_id = $1 and type = 'review.reopened'", [org])).map((row) => row.description))
    .toEqual(["Validation rouverte par l’agence : « La hiérarchie du bloc principal doit être revue »"]);
  expect(writes.filter((write) => write === "PATCH /api/state")).toEqual([]);
  expect(errors).toEqual([]);
});
