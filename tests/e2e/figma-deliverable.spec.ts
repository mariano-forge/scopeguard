// A « Figma » deliverable (US-054, step 2a): made from the link of a Figma file, read by the server with the
// agency's Figma account; the agency ticks the pages up for review and the version saved in Figma that the
// client is sent. A new version is a new round, about another saved version. Nothing the page says of the
// file is kept: the server reads it again from Figma. Figma is the run's stand-in (figmaStandIn.ts).

import { expect, test } from "@playwright/test";
import { baseURL } from "../../playwright.config";
import { addColleague, call, connectFigma, createAgency, figmaLink, newPerson, seedState, signInPage, signUp, sql, unique, verifiedClient, type Member } from "./helpers";

const fileKey = (prefix = "File") => `${prefix}${unique("k").replace(/[^A-Za-z0-9]/g, "")}`;
const round = (pages: string[], versionId: string) => ({ pages, versionId });

async function agencyWithProject(name = "Alice Martin") {
  const owner = await signUp(name);
  const org = await createAgency(owner, "Studio Figma");
  await seedState(owner, {
    lists: {
      clients: { upsert: [{ id: 1, name: "Northwind" }], remove: [] },
      projects: { upsert: [{ id: 7, name: "Refonte", clientId: 1, client: "Northwind", status: "En cours" }], remove: [] },
    },
  });
  return { owner, org };
}

const deliverablesOf = (org: string) => sql<{ id: string; version: number; data: Record<string, unknown> }>("select id, version, data from deliverables where organization_id = $1 order by version", [org]);
const createFigma = (member: Member, body: Record<string, unknown>) => call("/api/deliverables", { person: member, body: { projectId: 7, name: "Maquette", type: "Figma", size: 0, ...body } });

test("the agency makes a « Figma » deliverable from a file's link: pages ticked, a saved version, then a new round", async ({ browser }) => {
  const { owner, org } = await agencyWithProject();
  await connectFigma(owner);
  const key = fileKey();

  const { page, errors } = await newPerson(browser);
  await signInPage(page, owner.email);
  await page.goto("/projets/7");
  await page.getByRole("button", { name: "Ajouter un livrable", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Nouveau livrable" });
  await dialog.locator(".kind-option").filter({ hasText: /^Figma$/ }).click();
  await dialog.getByLabel("Lien du fichier Figma").fill(figmaLink(key));

  // Its pages, all ticked; its saved versions, the latest first, without Figma's unnamed autosaves.
  const pages = dialog.getByRole("group", { name: "Pages en revue" });
  for (const name of ["Accueil", "Contact", "Brouillons"]) await expect(pages.getByRole("checkbox", { name })).toBeChecked();
  await pages.getByRole("checkbox", { name: "Brouillons" }).uncheck();
  const version = dialog.getByRole("combobox", { name: "Version Figma envoyée au client" });
  await expect(version).toContainText("V2 envoyée au client");
  await version.click();
  await expect(page.getByRole("option")).toHaveCount(2);
  await page.getByRole("option", { name: /V1 envoyée au client/ }).click();
  // Named after its file unless the agency names it.
  await expect(dialog.getByLabel("Nom du livrable")).toHaveAttribute("placeholder", `Maquette ${key}`);
  await dialog.getByRole("button", { name: "Créer le livrable" }).click();

  await page.waitForURL(/livrables\/\d+/);
  const board = page.getByRole("region", { name: "Tableau Figma" });
  await expect(board.getByRole("heading", { name: `Maquette ${key}` })).toBeVisible();
  await expect(board).toContainText("« V1 envoyée au client », enregistrée le 20 octobre 2026 par Mariano");
  await expect(board).toContainText("Accueil, Contact");
  await expect(board.getByRole("link", { name: "Ouvrir dans Figma" })).toHaveAttribute("href", `https://www.figma.com/design/${key}`);
  await expect(board).toContainText("Aucune demande de Figma pour l’instant.");
  const [first] = await deliverablesOf(org);
  expect(first.data).toMatchObject({
    type: "Figma",
    name: `Maquette ${key}`,
    url: `https://www.figma.com/design/${key}`,
    figma: { fileKey: key, fileName: `Maquette ${key}`, reviewed: ["0:1", "0:2"], version: { id: "101", label: "V1 envoyée au client" } },
  });

  // A new round: the same pages to start with, another saved version; the current one is refused.
  const versions = page.getByRole("region", { name: "Versions" });
  await expect(versions.locator('input[type="file"]')).toHaveCount(0);
  await versions.getByRole("button", { name: "Nouvelle tournée Figma" }).click();
  const next = page.getByRole("dialog", { name: "Nouvelle tournée Figma" });
  const nextPages = next.getByRole("group", { name: "Pages en revue" });
  await expect(nextPages.getByRole("checkbox", { name: "Contact" })).toBeChecked();
  await expect(nextPages.getByRole("checkbox", { name: "Brouillons" })).not.toBeChecked();
  await next.getByRole("combobox", { name: "Version Figma envoyée au client" }).click();
  await page.getByRole("option", { name: /V1 envoyée au client/ }).click();
  await next.getByRole("button", { name: "Créer la tournée" }).click();
  await expect(next.getByRole("alert")).toContainText("est déjà la version de la tournée en cours");
  await next.getByRole("combobox", { name: "Version Figma envoyée au client" }).click();
  await page.getByRole("option", { name: /V2 envoyée au client/ }).click();
  await next.getByRole("button", { name: "Créer la tournée" }).click();
  await expect(next).toHaveCount(0);
  await expect.poll(async () => (await deliverablesOf(org)).map((record) => [record.version, record.data.status, (record.data.figma as { version: { id: string } }).version.id])).toEqual([
    [1, "Remplacée", "101"],
    [2, "En attente client", "102"],
  ]);
  await expect(page.getByRole("region", { name: "Tableau Figma" })).toContainText("« V2 envoyée au client »");
  expect(errors).toEqual([]);
});

test("the dialog says why a file cannot be used: not shared with the account, no saved version, not a Figma link", async ({ browser }) => {
  const { owner, org } = await agencyWithProject();
  await connectFigma(owner);
  const { page, errors } = await newPerson(browser);
  await signInPage(page, owner.email);
  await page.goto("/projets/7");
  await page.getByRole("button", { name: "Ajouter un livrable", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Nouveau livrable" });
  await dialog.locator(".kind-option").filter({ hasText: /^Figma$/ }).click();
  const link = dialog.getByLabel("Lien du fichier Figma");

  await link.fill(figmaLink(fileKey("Absent")));
  await expect(dialog.getByRole("alert")).toContainText("Ce fichier n’est pas accessible au compte Figma connecté");
  await link.fill(figmaLink(fileKey("Unsaved")));
  await expect(dialog.getByRole("note")).toContainText("Aucune version enregistrée dans ce fichier");
  await expect(dialog.getByRole("button", { name: "Relire le fichier" })).toBeVisible();
  await dialog.getByRole("button", { name: "Créer le livrable" }).click();
  await expect(dialog.getByRole("alert")).toContainText("Enregistrez dans Figma la version");
  await link.fill("https://www.example.com/design/Abcdefghijkl");
  await dialog.getByRole("button", { name: "Créer le livrable" }).click();
  await expect(dialog.getByRole("alert")).toContainText("Collez le lien d’un fichier Figma");
  expect(await deliverablesOf(org)).toEqual([]);
  expect(errors).toEqual([]);
});

test("the server reads the file again from Figma: anything else is refused, and nothing is made", async () => {
  const { owner, org } = await agencyWithProject();
  const key = fileKey();

  // Not connected to Figma: said, with how to connect.
  const unconnected = await createFigma(owner, { url: figmaLink(key), figma: round(["0:1"], "101") });
  expect(unconnected.status).toBe(409);
  expect(unconnected.json.error).toContain("Figma n’est pas connecté");
  expect((await call(`/api/integrations/figma/files/${key}`, { person: owner })).json.code).toBe("FIGMA_NOT_CONNECTED");

  await connectFigma(owner);
  const refusals: [Record<string, unknown>, number, string?][] = [
    [{ url: "https://www.example.com/design/Abcdefghijkl", figma: round(["0:1"], "101") }, 400],
    [{ url: figmaLink(key) }, 400],
    [{ url: figmaLink(key), figma: round(["0:1"], "101"), fileData: "/api/files/00000000-0000-4000-8000-000000000000" }, 400],
    [{ url: figmaLink(key), figma: round(["9:9"], "101") }, 400, "Une page choisie n’est plus dans le fichier Figma"],
    // An unnamed autosave, or a version the file does not have.
    [{ url: figmaLink(key), figma: round(["0:1"], "101b") }, 400, "n’est pas dans l’historique du fichier Figma"],
    [{ url: figmaLink(key), figma: round(["0:1"], "999") }, 400, "n’est pas dans l’historique du fichier Figma"],
    [{ url: figmaLink(fileKey("Absent")), figma: round(["0:1"], "101") }, 404, "n’est pas accessible au compte Figma connecté"],
  ];
  for (const [body, status, error] of refusals) {
    const refused = await createFigma(owner, body);
    expect(refused.status, JSON.stringify(body)).toBe(status);
    if (error) expect(refused.json.error).toContain(error);
  }
  expect(await deliverablesOf(org)).toEqual([]);
  expect((await call("/api/integrations/figma/files/pas-un-fichier", { person: owner })).status).toBe(400);

  // What the page says of the file is not kept: its name and pages come from Figma. A member makes one too.
  const member = await addColleague(owner, "Bruno Petit", "member");
  const made = await createFigma(member, { url: figmaLink(key), figma: { ...round(["0:2", "0:2"], "101"), fileName: "Piraté", pages: ["0:2"] } });
  expect(made.status).toBe(200);
  const [record] = await deliverablesOf(org);
  expect(record.data.figma).toMatchObject({ fileName: `Maquette ${key}`, reviewed: ["0:2"], pages: [{ id: "0:1", name: "Accueil" }, { id: "0:2", name: "Contact" }, { id: "0:3", name: "Brouillons" }] });

  // A round of a « Figma » only, about another saved version; a file is no round of it, nor a round of a PDF.
  const deliverableId = Number(record.id);
  const nextRound = (body: Record<string, unknown>, id = deliverableId) => call(`/api/deliverables/${id}/versions`, { person: owner, body: { type: "Figma", ...body } });
  expect((await nextRound({ figma: round(["0:1"], "101") })).json.error).toContain("est déjà la version de la tournée en cours");
  expect((await nextRound({ figma: round(["0:1"], "102"), url: figmaLink(fileKey()) })).status).toBe(400);
  expect((await call(`/api/deliverables/${deliverableId}/versions`, { person: owner, body: { type: "PDF", size: 1, fileData: "/api/files/00000000-0000-4000-8000-000000000000" } })).status).toBe(400);
  await seedState(owner, { lists: { deliverables: { upsert: [{ id: 99, projectId: 7, name: "Cahier", type: "PDF", version: 1, status: "En attente client", importedAt: "x", locked: false, size: 1 }], remove: [] } } });
  expect((await nextRound({ figma: round(["0:1"], "102") }, 99)).status).toBe(400);
  expect((await nextRound({ figma: round(["0:1"], "102") })).status).toBe(200);
  expect((await deliverablesOf(org)).filter((row) => row.data.type === "Figma").map((row) => row.version)).toEqual([1, 2]);
});

test("the agency's Figma token is renewed before it expires, and a connection Figma no longer honours asks to connect again", async () => {
  const { owner, org } = await agencyWithProject();
  await connectFigma(owner);
  const key = fileKey();
  const sealed = async () => (await sql<{ access_token: string; expires_at: Date }>("select access_token, expires_at from figma_connections where organization_id = $1", [org]))[0];
  const before = await sealed();

  // Expiring within a day: renewed on the next read, sealed again.
  await sql("update figma_connections set expires_at = now() + interval '1 hour' where organization_id = $1", [org]);
  expect((await call(`/api/integrations/figma/files/${key}`, { person: owner })).json).toMatchObject({ name: `Maquette ${key}` });
  const after = await sealed();
  expect(after.access_token).not.toBe(before.access_token);
  expect(after.access_token).toMatch(/^v1\./);
  expect(after.expires_at.getTime()).toBeGreaterThan(Date.now() + 80 * 24 * 3600 * 1000);

  // A refresh token that cannot be read (altered in the database): the agency connects again.
  await sql("update figma_connections set expires_at = now(), refresh_token = 'v1.abc.def.ghi' where organization_id = $1", [org]);
  expect((await call(`/api/integrations/figma/files/${key}`, { person: owner })).json.code).toBe("FIGMA_NOT_CONNECTED");
});

test("the client is told to comment in Figma, and sees the file, the round and its pages", async ({ browser }) => {
  const { owner } = await agencyWithProject();
  await connectFigma(owner);
  const key = fileKey();
  const made = await createFigma(owner, { url: figmaLink(key), figma: round(["0:1"], "102") });
  const deliverableId = made.json.id as number;
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
  const board = page.getByRole("region", { name: "Tableau Figma" });
  await expect(board.getByRole("heading", { name: "Commentez la maquette dans Figma" })).toBeVisible();
  await expect(board).toContainText("« V2 envoyée au client »");
  await expect(board).toContainText("Page en revue");
  await expect(board).toContainText("Accueil");
  await expect(board.getByRole("link", { name: "Ouvrir dans Figma" })).toHaveAttribute("href", `https://www.figma.com/design/${key}`);
  expect(errors).toEqual([]);
});
