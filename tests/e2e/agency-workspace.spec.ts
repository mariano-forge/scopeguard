// Spaces, projects, deliverables and the trash through the agency's routes (src/db/workspaceActions.ts):
// names and places checked, files only the agency's own, deletions reserved to administrators.

import { expect, test } from "@playwright/test";
import { addColleague, call, createAgency, makePdf, patchState, signUp, sql, upload, type Person } from "./helpers";

async function agency() {
  const alice = await signUp("Alice Martin");
  await createAgency(alice, "Studio Rangement API");
  await patchState(alice, {
    lists: {
      clients: { upsert: [{ id: 1, name: "Northwind" }, { id: 2, name: "Globex" }], remove: [] },
      projects: { upsert: [{ id: 1, name: "Refonte", clientId: 1, client: "Northwind", status: "En cours" }, { id: 2, name: "Campagne", clientId: 1, client: "Northwind", status: "En cours" }], remove: [] },
      deliverables: {
        upsert: [
          { id: 1, projectId: 1, name: "maquette.png", type: "Image", version: 1, status: "Approuvée", locked: true, reviewStatus: "approved", importedAt: "x" },
          { id: 2, projectId: 1, name: "maquette.png", type: "Image", version: 2, status: "En attente client", locked: false, importedAt: "x" },
          { id: 3, projectId: 1, name: "logo.png", type: "Image", version: 1, status: "En attente client", locked: false, importedAt: "x" },
          { id: 4, projectId: 2, name: "maquette.png", type: "Image", version: 1, status: "En attente client", locked: false, importedAt: "x" },
        ],
        remove: [],
      },
    },
  });
  const bob = await addColleague(alice, "Bob Membre", "member");
  const act = (person: Partial<Person>, path: string, method: "POST" | "PATCH" | "DELETE", body?: Record<string, unknown>) => call(`/api/${path}`, { method, person, body: body ?? (method === "DELETE" ? undefined : {}) });
  return { alice, bob, org: alice.organizationId!, act };
}

const data = async (org: string, table: "clients" | "projects" | "deliverables", id: number) =>
  (await sql<{ data: Record<string, unknown> }>(`select data from ${table} where organization_id = $1 and id = $2`, [org, id]))[0]?.data;

test("deliverables: renamed and moved as a whole, refused on a name clash; a new version freezes the others", async () => {
  const { alice, org, act } = await agency();
  expect((await act(alice, "deliverables/2", "PATCH", { name: "Logo.png" })).status).toBe(409);
  expect((await act(alice, "deliverables/2", "PATCH", { projectId: 2 })).status).toBe(409);
  expect((await act(alice, "deliverables/1", "PATCH", { name: "accueil.png" })).status).toBe(200);
  expect([(await data(org, "deliverables", 1)).name, (await data(org, "deliverables", 2)).name]).toEqual(["accueil.png", "accueil.png"]);
  expect((await act(alice, "deliverables/3", "PATCH", { projectId: 2 })).status).toBe(200);
  expect((await data(org, "deliverables", 3)).projectId).toBe(2);
  expect((await act(alice, "deliverables/3", "PATCH", { projectId: 99 })).status).toBe(404);

  const file = await upload(alice, makePdf("v3"), "v3.pdf", { kind: "version", projectId: 1, livrableId: 1, version: 3 });
  const version = await act(alice, "deliverables/2/versions", "POST", { type: "PDF", size: 100, fileData: file.json.href });
  expect(version.status).toBe(200);
  expect(await data(org, "deliverables", version.json.id as number)).toMatchObject({ name: "accueil.png", version: 3, status: "En attente client", locked: false, fileData: file.json.href });
  expect(await data(org, "deliverables", 2)).toMatchObject({ status: "Remplacée", locked: true });
  expect(await data(org, "deliverables", 1)).toMatchObject({ status: "Remplacée", locked: true });
});

test("files: a deliverable may only point at the agency's own imports", async () => {
  const { alice, org, act } = await agency();
  const mallory = await signUp("Mallory Autre");
  await createAgency(mallory, "Studio Intrus Rangement");
  const foreign = await upload(mallory, makePdf("ailleurs"), "ailleurs.pdf", { kind: "version", projectId: 1, livrableId: 1, version: 1 });
  expect((await act(alice, "deliverables", "POST", { projectId: 1, name: "vol.pdf", type: "PDF", size: 1, fileData: foreign.json.href })).status).toBe(404);
  expect((await act(alice, "deliverables/3/versions", "POST", { type: "PDF", size: 1, fileData: foreign.json.href })).status).toBe(404);
  expect((await act(alice, "deliverables", "POST", { projectId: 1, name: "x.pdf", type: "PDF", size: 1, fileData: "https://evil.example/x.pdf" })).status).toBe(400);
  expect((await act(alice, "deliverables", "POST", { projectId: 1, name: "site", type: "Link", size: 0, url: "javascript:alert(1)" })).status).toBe(400);
  expect((await act(alice, "deliverables", "POST", { projectId: 1, name: "site", type: "Exe", size: 0 })).status).toBe(400);
  const link = await act(alice, "deliverables", "POST", { projectId: 1, name: "site", type: "Link", size: 0, url: "https://exemple.fr" });
  expect(link.status).toBe(200);
  expect(await data(org, "deliverables", link.json.id as number)).toMatchObject({ type: "Link", url: "https://exemple.fr", version: 1 });
});

test("members organise, administrators delete spaces and projects and empty the trash", async () => {
  const { alice, bob, org, act } = await agency();
  const space = await act(bob, "spaces", "POST", { name: "Initech", email: "pas-une-adresse" });
  expect(space.status).toBe(400);
  const created = await act(bob, "spaces", "POST", { name: "Initech" });
  expect(created.status).toBe(200);
  const project = await act(bob, "projects", "POST", { clientId: created.json.id, name: "Intranet" });
  expect(await data(org, "projects", project.json.id as number)).toMatchObject({ name: "Intranet", client: "Initech", status: "Brouillon" });
  expect((await act(bob, `projects/${project.json.id}`, "PATCH", { clientId: 2 })).status).toBe(200);
  expect(await data(org, "projects", project.json.id as number)).toMatchObject({ clientId: 2, client: "Globex" });

  for (const path of ["projects/2", "spaces/1"]) {
    const refused = await act(bob, path, "DELETE");
    expect(refused.status, path).toBe(403);
    expect(refused.json.code).toBe("ADMIN_ONLY");
  }
  // A member may put a deliverable in the trash and restore it, not empty the trash.
  expect((await act(bob, "deliverables/3", "DELETE")).status).toBe(200);
  const [item] = await sql<{ id: string }>("select id from trash_items where organization_id = $1", [org]);
  expect((await act(bob, `trash/${item.id}`, "DELETE")).status).toBe(403);
  expect((await act(bob, `trash/${item.id}/restore`, "POST")).status).toBe(200);
  expect(await data(org, "deliverables", 3)).toMatchObject({ name: "logo.png" });

  // The space goes with its projects and their deliverables, and comes back whole.
  expect((await act(alice, "spaces/1", "DELETE")).status).toBe(200);
  expect(await data(org, "projects", 1)).toBeUndefined();
  expect(await data(org, "deliverables", 4)).toBeUndefined();
  const [spaceItem] = await sql<{ id: string; kind: string }>("select id, kind from trash_items where organization_id = $1", [org]);
  expect(spaceItem.kind).toBe("space");
  expect((await act(alice, `trash/${spaceItem.id}/restore`, "POST")).status).toBe(200);
  expect(await data(org, "deliverables", 4)).toMatchObject({ name: "maquette.png" });

  // Emptying: everything, for good; items older than 30 days on the administrator's page.
  await act(alice, "projects/2", "DELETE");
  await sql("update trash_items set deleted_at = 0, data = jsonb_set(data, '{deletedAt}', '0') where organization_id = $1", [org]);
  expect((await act(bob, "trash/expired", "DELETE")).status).toBe(403);
  expect((await act(alice, "trash/expired", "DELETE")).status).toBe(200);
  expect(await sql("select 1 from trash_items where organization_id = $1", [org])).toHaveLength(0);
});

test("another agency's spaces, projects and trash are out of reach", async () => {
  const { act } = await agency();
  const mallory = await signUp("Mallory Autre");
  await createAgency(mallory, "Studio Intrus Rangement 2");
  expect((await act(mallory, "spaces/1", "PATCH", { name: "pris" })).status).toBe(404);
  expect((await act(mallory, "projects/1", "PATCH", { name: "pris" })).status).toBe(404);
  expect((await act(mallory, "projects", "POST", { clientId: 1, name: "pris" })).status).toBe(404);
  expect((await act(mallory, "deliverables/1", "DELETE")).status).toBe(404);
  expect((await act(mallory, "deliverables/1/versions", "POST", { type: "PDF", size: 1, fileData: "/api/files/00000000-0000-0000-0000-000000000000" })).status).toBe(404);
  expect((await act({ cookie: "", ip: "198.51.200.6" }, "spaces", "POST", { name: "anonyme" })).status).toBe(401);
});
