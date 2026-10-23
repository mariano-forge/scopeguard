// A « Figma » deliverable (US-054, step 2a): made from the link of a Figma file, read by the server with the
// agency's Figma account; the agency ticks the pages up for review and the version saved in Figma that the
// client is sent. A new version is a new round, about another saved version. Figma allows a View or Collab
// seat 20 reads of a file a month: its pages are read once per deliverable, the server trusting its own
// signed reading (src/lib/figmaReceipt.ts) and nothing else the page says of the file. Figma is the run's
// stand-in (figmaStandIn.ts), which counts the reads.

import { expect, test } from "@playwright/test";
import { baseURL } from "../../playwright.config";
import { addColleague, call, connectFigma, createAgency, figmaLink, newPerson, seedState, signInPage, signUp, sql, unique, verifiedClient, type Member } from "./helpers";
import { figmaReads } from "./figmaStandIn";

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
/** The server's signed reading of a file's pages, as « Nouveau livrable » gets it. */
const receiptFor = async (member: Member, key: string) => (await call(`/api/integrations/figma/files/${key}`, { person: member })).json.receipt as string;

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
  // The file's pages read once, by the dialog (the creation trusted that reading); then, the deliverable
  // open, its comments brought in, which reads the round's screens once (src/db/figmaImport.ts).
  await expect.poll(async () => (await figmaReads(key)).file).toBe(2);
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
  // A round reads only the file's history; its first import reads its own version's screens, once.
  await expect.poll(async () => (await figmaReads(key)).file).toBe(3);
  expect(errors).toEqual([]);
});

test("the dialog says why a file cannot be used: not shared, Figma's limit reached, no saved version, not a Figma link", async ({ browser }) => {
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
  // Figma's limit on reading files, said as it is, with until when.
  await link.fill(figmaLink(fileKey("Limited")));
  await expect(dialog.getByRole("alert")).toContainText("Figma limite les lectures de fichiers du compte connecté jusqu’au");
  // No saved version yet: « Relire le fichier » reads the history again, never the pages.
  const unsaved = fileKey("Unsaved");
  await link.fill(figmaLink(unsaved));
  await expect(dialog.getByRole("note")).toContainText("Aucune version enregistrée dans ce fichier");
  await dialog.getByRole("button", { name: "Relire le fichier" }).click();
  await expect(dialog.getByRole("note")).toContainText("Aucune version enregistrée dans ce fichier");
  await expect.poll(() => figmaReads(unsaved)).toEqual({ file: 1, versions: 2 });
  await dialog.getByRole("button", { name: "Créer le livrable" }).click();
  await expect(dialog.getByRole("alert")).toContainText("Enregistrez dans Figma la version");
  await link.fill("https://www.example.com/design/Abcdefghijkl");
  await dialog.getByRole("button", { name: "Créer le livrable" }).click();
  await expect(dialog.getByRole("alert")).toContainText("Collez le lien d’un fichier Figma");
  expect(await deliverablesOf(org)).toEqual([]);
  expect(errors).toEqual([]);
});

test("the server trusts only its own reading of the file: anything else is refused, and nothing is made", async () => {
  const { owner, org } = await agencyWithProject();
  const key = fileKey();

  // Not connected to Figma: said, with how to connect.
  const unconnected = await call(`/api/integrations/figma/files/${key}`, { person: owner });
  expect(unconnected.status).toBe(409);
  expect(unconnected.json).toMatchObject({ code: "FIGMA_NOT_CONNECTED", error: expect.stringContaining("Figma n’est pas connecté") });

  await connectFigma(owner);
  const receipt = await receiptFor(owner, key);
  // Another agency's reading of the same file, or a reading altered: not this agency's.
  const other = await agencyWithProject("Oscar Autre");
  await connectFigma(other.owner);
  const othersReceipt = await receiptFor(other.owner, key);
  const otherFile = fileKey();
  const refusals: [Record<string, unknown>, number, string?][] = [
    [{ url: "https://www.example.com/design/Abcdefghijkl", figma: { ...round(["0:1"], "101"), receipt } }, 400],
    [{ url: figmaLink(key) }, 400],
    [{ url: figmaLink(key), figma: { ...round(["0:1"], "101"), receipt }, fileData: "/api/files/00000000-0000-4000-8000-000000000000" }, 400],
    [{ url: figmaLink(key), figma: round(["0:1"], "101") }, 400, "La lecture du fichier Figma a expiré"],
    [{ url: figmaLink(key), figma: { ...round(["0:1"], "101"), receipt: `${receipt}x` } }, 400, "La lecture du fichier Figma a expiré"],
    [{ url: figmaLink(key), figma: { ...round(["0:1"], "101"), receipt: othersReceipt } }, 400, "La lecture du fichier Figma a expiré"],
    [{ url: figmaLink(otherFile), figma: { ...round(["0:1"], "101"), receipt } }, 400, "La lecture du fichier Figma a expiré"],
    [{ url: figmaLink(key), figma: { ...round(["9:9"], "101"), receipt } }, 400, "Une page choisie n’est pas dans le fichier Figma"],
    // An unnamed autosave, or a version the file does not have (its history is read from Figma again).
    [{ url: figmaLink(key), figma: { ...round(["0:1"], "101b"), receipt } }, 400, "n’est pas dans l’historique du fichier Figma"],
    [{ url: figmaLink(key), figma: { ...round(["0:1"], "999"), receipt } }, 400, "n’est pas dans l’historique du fichier Figma"],
  ];
  for (const [body, status, error] of refusals) {
    const refused = await createFigma(owner, body);
    expect(refused.status, JSON.stringify(body).slice(0, 200)).toBe(status);
    if (error) expect(refused.json.error).toContain(error);
  }
  expect(await deliverablesOf(org)).toEqual([]);
  expect((await call("/api/integrations/figma/files/pas-un-fichier", { person: owner })).status).toBe(400);
  expect((await call(`/api/integrations/figma/files/${fileKey("Absent")}`, { person: owner })).json.code).toBe("FIGMA_FILE_MISSING");
  const limited = await call(`/api/integrations/figma/files/${fileKey("Limited")}`, { person: owner });
  expect(limited.status).toBe(429);
  expect(limited.json.code).toBe("FIGMA_RATE_LIMITED");
  // The pages were read once for this agency; refusals and creations read only the history.
  expect((await figmaReads(key)).file).toBe(2);

  // What the page says of the file is not kept: its name and pages are those the server read. A member makes one too.
  const member = await addColleague(owner, "Bruno Petit", "member");
  const made = await createFigma(member, { url: figmaLink(key), figma: { ...round(["0:2", "0:2"], "101"), receipt, fileName: "Piraté", pages: ["0:2"] } });
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
  // A round ticks among the pages read for the deliverable.
  expect((await nextRound({ figma: round(["9:9"], "102") })).json.error).toContain("Une page choisie n’est pas dans le fichier Figma");
  const second = await nextRound({ figma: round(["0:1"], "102") });
  expect(second.status).toBe(200);
  expect((await figmaReads(key)).file).toBe(2);
  expect((await deliverablesOf(org)).filter((row) => row.data.type === "Figma").map((row) => row.version)).toEqual([1, 2]);

  // The proof of a round names the file, the version saved in Figma that was reviewed, and its pages.
  const proof = (await call(`/api/proof/${second.json.id}`, { person: owner })).json as { deliverable: { url: string; file: unknown; figma: unknown } };
  expect(proof.deliverable).toMatchObject({
    url: `https://www.figma.com/design/${key}`,
    file: null,
    figma: { fileKey: key, fileName: `Maquette ${key}`, version: { id: "102", label: "V2 envoyée au client", savedAt: "2026-10-22T10:00:00Z", savedBy: "Mariano" }, pages: ["Accueil"] },
  });
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
  const made = await createFigma(owner, { url: figmaLink(key), figma: { ...round(["0:1"], "102"), receipt: await receiptFor(owner, key) } });
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
