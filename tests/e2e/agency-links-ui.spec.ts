// Review links in the agency's editor, used as an administrator does: sharing creates the link,
// invitations are removed, the link is revoked, the client page is previewed, a validation reopened.

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

  const email = `${unique("claire")}@client.test`;
  await page.getByLabel("Inviter par e-mail").fill(email);
  await page.getByRole("button", { name: "Inviter", exact: true }).click();
  await expect.poll(async () => (await link(org)).data.invites?.map((invite) => invite.email)).toEqual([email]);
  await page.getByRole("button", { name: `Retirer ${email}` }).click();
  await expect.poll(async () => (await link(org)).data.invites?.length ?? 0).toBe(0);

  await page.getByRole("button", { name: "Révoquer ce lien" }).click();
  await expect.poll(async () => (await link(org)).active).toBe(false);

  // Sharing again: a new active link for the version.
  await page.getByRole("button", { name: "Partager la revue" }).first().click();
  await expect.poll(async () => (await link(org)).active).toBe(true);
  expect((await link(org)).token).not.toBe(created.token);
  expect(writes.filter((write) => write === "PATCH /api/state")).toEqual([]);
  expect(errors).toEqual([]);
});

test("the client preview opens the client page of a link created for it", async ({ browser }) => {
  const { org, page, errors, writes } = await editor(browser);
  const [preview] = await Promise.all([page.context().waitForEvent("page"), page.getByRole("button", { name: "Aperçu client" }).first().click()]);
  await expect(preview.getByText("Aperçu agence · lecture seule")).toBeVisible();
  expect(new URL(preview.url()).pathname).toBe(`/review/${(await link(org)).token}`);
  expect(writes.filter((write) => write === "PATCH /api/state")).toEqual([]);
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
