// Spaces, projects, deliverables and the trash, used as an administrator does in the agency's pages.

import { expect, test, type Browser } from "@playwright/test";
import { createAgency, newPerson, seedState, signInPage, signUp, sql } from "./helpers";

async function workspace(browser: Browser) {
  const alice = await signUp("Alice Martin");
  await createAgency(alice, "Studio Rangement");
  await seedState(alice, {
    lists: {
      clients: { upsert: [{ id: 1, name: "Northwind" }], remove: [] },
      projects: {
        upsert: [
          { id: 1, name: "Refonte", clientId: 1, client: "Northwind", status: "En cours" },
          { id: 2, name: "Campagne", clientId: 1, client: "Northwind", status: "En cours" },
        ],
        remove: [],
      },
      deliverables: { upsert: [{ id: 1, projectId: 1, name: "maquette.png", type: "Image", version: 1, status: "En attente client", locked: false, importedAt: "14/10/2026 10:00" }], remove: [] },
      comments: { upsert: [{ id: 30, deliverableId: 1, author: "Claire Dubois", initials: "CD", from: "client", message: "Avis", decision: "À qualifier", kind: "remark", location: "", time: "t" }], remove: [] },
    },
  });
  const { page, errors } = await newPerson(browser);
  const writes: string[] = [];
  page.on("request", (sent) => {
    if (sent.method() !== "GET" && sent.url().includes("/api/") && !sent.url().includes("/api/auth/")) writes.push(`${sent.method()} ${new URL(sent.url()).pathname}`);
  });
  await signInPage(page, alice.email);
  return { org: alice.organizationId!, page, errors, writes };
}

const rows = <T,>(query: string, org: string, params: unknown[] = []) => sql<T>(query, [org, ...params]);

test("an administrator creates a space and a project, then renames them", async ({ browser }) => {
  const { org, page, errors, writes } = await workspace(browser);
  await page.goto("/espaces");
  await page.getByRole("button", { name: "Ajouter un espace" }).click();
  await page.getByLabel("Nom de l’espace").fill("Atelier Horizon");
  await page.getByRole("button", { name: "Créer l’espace" }).click();
  await page.waitForURL(/\/espaces\/\d+$/);
  const spaceId = Number(page.url().split("/").at(-1));
  await expect.poll(async () => (await rows<{ name: string }>("select data->>'name' as name from clients where organization_id = $1 and id = $2", org, [spaceId]))[0]?.name).toBe("Atelier Horizon");

  await page.getByRole("button", { name: "Ajouter un projet" }).click();
  await page.getByLabel("Nom du projet").fill("Site vitrine");
  await page.getByRole("button", { name: "Créer le projet" }).click();
  await page.waitForURL(/\/projets\/\d+$/);
  const projectId = Number(page.url().split("/").at(-1));
  await expect.poll(async () => (await rows<{ data: Record<string, unknown> }>("select data from projects where organization_id = $1 and id = $2", org, [projectId]))[0]?.data).toMatchObject({
    name: "Site vitrine",
    clientId: spaceId,
    client: "Atelier Horizon",
    status: "Brouillon",
  });

  await page.getByRole("button", { name: /^Site vitrine\s*, renommer le projet$/ }).click();
  await page.getByLabel("Renommer le projet").fill("Site vitrine 2026");
  await page.getByLabel("Renommer le projet").press("Enter");
  await expect.poll(async () => (await rows<{ name: string }>("select data->>'name' as name from projects where organization_id = $1 and id = $2", org, [projectId]))[0]?.name).toBe("Site vitrine 2026");

  // Renaming the space also renames the copy its projects keep.
  await page.goto(`/espaces/${spaceId}`);
  await page.getByRole("button", { name: /^Atelier Horizon\s*, renommer l’espace$/ }).click();
  await page.getByLabel("Renommer l’espace").fill("Atelier Horizon SA");
  await page.getByLabel("Renommer l’espace").press("Enter");
  await expect.poll(async () => (await rows<{ client: string }>("select data->>'client' as client from projects where organization_id = $1 and id = $2", org, [projectId]))[0]?.client).toBe("Atelier Horizon SA");
  expect((await rows<{ name: string }>("select data->>'name' as name from clients where organization_id = $1 and id = $2", org, [spaceId]))[0].name).toBe("Atelier Horizon SA");
  expect(writes.filter((write) => write === "PATCH /api/state")).toEqual([]);
  expect(errors).toEqual([]);
});

test("a project created from the home page goes in the space chosen in the dialog", async ({ browser }) => {
  const { org, page, errors } = await workspace(browser);
  await page.goto("/");
  await page.getByRole("button", { name: "Ajouter un projet" }).click();
  const dialog = page.getByRole("dialog", { name: "Créer un projet" });
  await dialog.getByLabel("Nom du projet").fill("Identité visuelle");
  await expect(dialog.getByLabel("Espace", { exact: true })).toContainText("Northwind");
  await dialog.getByRole("button", { name: "Créer le projet" }).click();
  await page.waitForURL(/\/projets\/\d+$/);
  const projectId = Number(page.url().split("/").at(-1));
  await expect.poll(async () => (await rows<{ data: Record<string, unknown> }>("select data from projects where organization_id = $1 and id = $2", org, [projectId]))[0]?.data).toMatchObject({ name: "Identité visuelle", clientId: 1 });
  expect(errors).toEqual([]);
});

test("a deleted deliverable goes to the trash with its requests and comes back; a deleted project is purged for good", async ({ browser }) => {
  const { org, page, errors, writes } = await workspace(browser);
  await page.goto("/projets/1");
  await page.getByRole("button", { name: "Actions sur maquette.png" }).click();
  await page.getByRole("menuitem", { name: "Mettre à la corbeille" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: /Supprimer|corbeille/ }).click();
  await expect.poll(async () => (await rows("select 1 from deliverables where organization_id = $1 and id = 1", org)).length).toBe(0);
  expect(await rows("select 1 from comments where organization_id = $1 and id = 30", org)).toHaveLength(0);
  expect((await rows<{ kind: string }>("select kind from trash_items where organization_id = $1", org)).map((row) => row.kind)).toEqual(["livrable"]);

  await page.goto("/corbeille");
  await page.getByRole("button", { name: "Restaurer" }).click();
  await expect.poll(async () => (await rows("select 1 from deliverables where organization_id = $1 and id = 1", org)).length).toBe(1);
  expect(await rows("select 1 from comments where organization_id = $1 and id = 30", org)).toHaveLength(1);
  expect(await rows("select 1 from trash_items where organization_id = $1", org)).toHaveLength(0);
  await expect.poll(async () => (await rows("select 1 from audit_events where organization_id = $1 and type = 'trash.restored'", org)).length).toBe(1);

  await page.goto("/projets/2");
  await page.getByRole("button", { name: /^Réglages de/ }).click();
  await page.getByRole("menuitem", { name: /Supprimer/ }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: /Supprimer/ }).click();
  await expect.poll(async () => (await rows("select 1 from projects where organization_id = $1 and id = 2", org)).length).toBe(0);
  await expect.poll(async () => (await rows("select 1 from audit_events where organization_id = $1 and type = 'project.deleted'", org)).length).toBe(1);

  await page.goto("/corbeille");
  await page.getByRole("button", { name: "Supprimer définitivement Campagne" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Supprimer définitivement" }).click();
  await expect.poll(async () => (await rows("select 1 from trash_items where organization_id = $1", org)).length).toBe(0);
  expect(await rows("select 1 from projects where organization_id = $1 and id = 2", org)).toHaveLength(0);
  expect(writes.filter((write) => write === "PATCH /api/state")).toEqual([]);
  expect(errors).toEqual([]);
});

test("back / forward arrows exist in the spaces area only: not on home, recents, shared, trash or « À traiter »", async ({ browser }) => {
  const { page, errors } = await workspace(browser);
  const history = page.getByRole("navigation", { name: "Historique" });
  for (const path of ["/espaces", "/espaces/1", "/projets/1"]) {
    await page.goto(path);
    await expect(history).toBeVisible();
  }
  for (const path of ["/", "/recents", "/partages", "/corbeille", "/a-traiter"]) {
    await page.goto(path);
    // The page is drawn (the account menu is there) before checking what it lacks.
    await expect(page.getByRole("button", { name: "Compte de Alice Martin" }).first()).toBeVisible();
    await expect(history).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});

test("the home page fits narrow screens: its wide tables scroll in their frame, never the page", async ({ browser }) => {
  const { page, errors } = await workspace(browser);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Vue d’ensemble" })).toBeVisible();
  for (const width of [1100, 840, 760, 600, 390]) {
    await page.setViewportSize({ width, height: 800 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), { message: `${width} px` }).toBeLessThanOrEqual(0);
  }
  expect(errors).toEqual([]);
});
