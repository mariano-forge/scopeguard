// A new version is shared by choice, in one click, with the people of the previous one; the client
// learns of it only once it is shared with them (src/app/(agency)/ReshareDialog.tsx,
// src/db/reviewAuth.ts newerSharedVersion).

import { expect, test, type Browser } from "@playwright/test";
import { baseURL } from "../../playwright.config";
import { call, createAgency, mailsTo, makePdf, newPerson, seedState, signInPage, signUp, sql, unique, verifiedClient, waitForMail, type Member } from "./helpers";

async function sharedV1() {
  const alice = await signUp("Alice Martin");
  await createAgency(alice, "Studio Versions");
  const token = unique("tok-v1");
  await seedState(alice, {
    lists: {
      clients: { upsert: [{ id: 1, name: "Northwind" }], remove: [] },
      projects: { upsert: [{ id: 1, name: "Refonte", clientId: 1, client: "Northwind", status: "En cours" }], remove: [] },
      deliverables: { upsert: [{ id: 1, projectId: 1, name: "maquette.pdf", type: "PDF", version: 1, status: "En attente client", locked: false, importedAt: "14/10/2026" }], remove: [] },
    },
    maps: { reviewLinks: { upsert: { "1:1": { token, active: true, expiresAt: "01/01/2099", autoExpire: true, deliverableId: 1, version: 1 } }, remove: [] } },
  });
  const [decider, contributor] = [`${unique("decideur")}@client.test`, `${unique("contributeur")}@client.test`];
  await call("/api/review-access/invite", { person: alice, body: { linkKey: "1:1", emails: [decider] } });
  await call("/api/review-access/invite", { person: alice, body: { linkKey: "1:1", emails: [contributor], role: "contributor" } });
  return { alice, org: alice.organizationId!, token, decider, contributor };
}

const invitesOf = async (org: string, key: string) =>
  (await sql<{ data: { invites?: { email: string; role?: string }[] } }>("select data from review_links where organization_id = $1 and key = $2", [org, key]))[0]?.data.invites ?? [];

async function importV2(browser: Browser, alice: Member) {
  const { page, errors } = await newPerson(browser);
  await signInPage(page, alice.email);
  await page.goto("/projets/1/livrables/1");
  await page.getByRole("button", { name: "Menu principal" }).first().click();
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.getByRole("menuitem", { name: /Nouvelle version/ }).click()]);
  await chooser.setFiles({ name: "maquette-v2.pdf", mimeType: "application/pdf", buffer: makePdf("Version 2") });
  return { page, errors };
}

test("after importing a version, the agency shares it with the people of the previous one, each with their role", async ({ browser }) => {
  const { alice, org, decider, contributor } = await sharedV1();
  const { page, errors } = await importV2(browser, alice);
  // (The modal's container is not exposed as a dialog: its heading and list are.)
  await expect(page.getByRole("heading", { name: "Partager la V02 ?" })).toBeVisible();
  const people = page.getByRole("list", { name: "Personnes invitées sur la V01" });
  await expect(people.getByRole("checkbox", { checked: true })).toHaveCount(2);
  await expect(people.getByRole("button", { name: `Rôle de ${contributor} sur la V02 : Contributeur` })).toBeVisible();
  // Only the decider this time.
  await people.getByRole("listitem").filter({ hasText: contributor }).getByRole("checkbox").uncheck();
  await page.getByRole("button", { name: "Partager avec 1 personne" }).click();
  await expect(page.getByRole("heading", { name: "Partager la V02 ?" })).toHaveCount(0);

  const [v2] = await sql<{ id: string }>("select id from deliverables where organization_id = $1 and version = 2", [org]);
  await expect.poll(async () => (await invitesOf(org, `${v2.id}:2`)).map((invite) => [invite.email, invite.role])).toEqual([[decider, "decider"]]);
  expect((await waitForMail(decider, "Nouvelle version")).subject).toBe("Nouvelle version de « maquette.pdf » (V2)");
  expect(mailsTo(contributor).some((mail) => mail.subject.startsWith("Nouvelle version"))).toBe(false);
  await expect(page.getByText("La V02 n’est partagée avec personne")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("« Plus tard » leaves the version unshared, with a reminder in the editor and in « À traiter »", async ({ browser }) => {
  const { alice, org, decider } = await sharedV1();
  const { page, errors } = await importV2(browser, alice);
  await expect(page.getByRole("heading", { name: "Partager la V02 ?" })).toBeVisible();
  await page.getByRole("button", { name: "Plus tard" }).click();
  const [v2] = await sql<{ id: string }>("select id from deliverables where organization_id = $1 and version = 2", [org]);
  expect(await invitesOf(org, `${v2.id}:2`)).toEqual([]);
  expect(mailsTo(decider).some((mail) => mail.subject.startsWith("Nouvelle version"))).toBe(false);

  await expect(page.getByText("La V02 n’est partagée avec personne")).toBeVisible();
  await page.goto("/a-traiter");
  await expect(page.getByRole("link", { name: /Version partagée avec personne.*maquette\.pdf V02/ })).toBeVisible();
  await page.getByRole("link", { name: /Version partagée avec personne.*maquette\.pdf V02/ }).click();
  // The editor's reminder reopens the same choice.
  await page.getByRole("button", { name: "Partager", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Partager la V02 ?" })).toBeVisible();
  await page.getByRole("button", { name: "Plus tard" }).click();

  // The reminder can be closed: gone from the editor, even after a reload; « À traiter » keeps it.
  await page.getByRole("button", { name: "Fermer ce rappel" }).click();
  await expect(page.getByText("La V02 n’est partagée avec personne")).toHaveCount(0);
  await page.reload();
  await expect(page.locator("[data-page]").first()).toBeVisible();
  await expect(page.getByText("La V02 n’est partagée avec personne")).toHaveCount(0);
  await page.goto("/a-traiter");
  await expect(page.getByRole("link", { name: /Version partagée avec personne.*maquette\.pdf V02/ })).toBeVisible();
  expect(errors).toEqual([]);
});

test("the client learns of a newer version only once it is shared with them, and opens it without a new code", async ({ browser }) => {
  const { alice, org, token, decider, contributor } = await sharedV1();
  const client = await verifiedClient(token, decider, "Claire Dubois");
  // V2 imported at the agency (V1 then replaced), not shared yet.
  await seedState(alice, {
    lists: {
      deliverables: {
        upsert: [
          { id: 1, projectId: 1, name: "maquette.pdf", type: "PDF", version: 1, status: "Remplacée", locked: true, importedAt: "14/10/2026" },
          { id: 2, projectId: 1, name: "maquette.pdf", type: "PDF", version: 2, status: "En attente client", locked: false, importedAt: "16/10/2026" },
        ],
        remove: [],
      },
    },
  });
  expect((await call(`/api/review/${token}/access`, { person: client })).json.newerVersion).toBeNull();
  const { page, errors } = await newPerson(browser);
  const [name, value] = client.cookie.split(";")[0].split("=");
  await page.context().addCookies([{ name, value, url: baseURL }]);
  await page.goto(`/review/${token}`);
  await expect(page.getByText("Cette version n’est plus en revue")).toBeVisible();
  await expect(page.getByText(/version plus récente|ancienne version|V02/)).toHaveCount(0);

  // Shared with the decider only: they see it, the contributor does not.
  const shared = await call("/api/deliverables/2/review-link", { method: "POST", person: alice, body: {} });
  const v2Token = (shared.json.link as { token: string }).token;
  await call("/api/review-access/invite", { person: alice, body: { linkKey: "2:2", emails: [decider], newVersion: true } });
  const contributorSession = await verifiedClient(token, contributor, "Paul Stagiaire");
  expect((await call(`/api/review/${token}/access`, { person: contributorSession })).json.newerVersion).toBeNull();

  await page.reload();
  await expect(page.getByText("Vous consultez une ancienne version")).toBeVisible();
  await page.getByRole("link", { name: "Voir la V02" }).click();
  await page.waitForURL(`**/review/${v2Token}`);
  await expect(page.getByRole("button", { name: "Valider cette version" })).toBeVisible();
  expect((await sql("select 1 from review_links where organization_id = $1 and key = '2:2'", [org])).length).toBe(1);
  expect(errors).toEqual([]);
});
