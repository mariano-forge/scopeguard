// Figma screens reviewed in Kora (US-054, step 2c): the agency picks screens of a Figma file, one format for
// the import; Kora has Figma draw them in one request and copies each into the agency's storage; the client
// comments on them in Kora, without a Figma account. Names and sizes come from the server's own reading of
// the file, the pictures from Figma's storage only, the files from the agency's own copies. Figma is the run's
// stand-in (figmaStandIn.ts), which counts its tightest reads.

import { expect, test } from "@playwright/test";
import { baseURL } from "../../playwright.config";
import { call, connectFigma, createAgency, figmaLink, makePdf, newPerson, seedState, signInPage, signUp, sql, unique, upload, verifiedClient, type Member } from "./helpers";
import { figmaReads } from "./figmaStandIn";

const fileKey = (prefix = "File") => `${prefix}${unique("k").replace(/[^A-Za-z0-9]/g, "")}`;

async function agency(name = "Alice Martin") {
  const owner = await signUp(name);
  const org = await createAgency(owner, "Studio Écrans");
  await seedState(owner, {
    lists: {
      clients: { upsert: [{ id: 1, name: "Northwind" }], remove: [] },
      projects: { upsert: [{ id: 7, name: "Refonte", clientId: 1, client: "Northwind", status: "En cours" }], remove: [] },
    },
  });
  await connectFigma(owner);
  return { owner, org };
}

const screensApi = (key: string) => `/api/integrations/figma/files/${key}/screens`;
const readScreens = async (member: Member, key: string) => (await call(screensApi(key), { person: member })).json as { name: string; screens: { id: string; name: string }[]; receipt: string };
const draw = (member: Member, key: string, body: Record<string, unknown>) => call(`${screensApi(key)}/draw`, { person: member, body });
const store = (member: Member, key: string, body: Record<string, unknown>) => call(`${screensApi(key)}/store`, { person: member, body: { projectId: 7, livrableId: 500, version: 1, ...body } });

/** Screens copied through the API, as the dialog does: read, drawn in one request, each one stored. */
async function copied(member: Member, key: string, ids: string[], format = "image", placement: Record<string, number> = {}) {
  const { receipt } = await readScreens(member, key);
  const { ticket } = (await draw(member, key, { receipt, ids, format })).json as { ticket: string };
  const screens = [];
  for (const id of ids) screens.push({ id, fileData: (await store(member, key, { ticket, id, ...placement })).json.fileData as string });
  return { receipt, ticket, screens };
}
const createScreens = (member: Member, key: string, body: Record<string, unknown>) =>
  call("/api/deliverables", { person: member, body: { id: 500, projectId: 7, name: "Écrans", type: "Screens", size: 0, url: figmaLink(key), columns: 2, ...body } });
const records = (org: string) => sql<{ id: string; version: number; data: Record<string, unknown> }>("select id, version, data from deliverables where organization_id = $1 order by version", [org]);

test("the agency picks Figma screens, page by page; they are copied into Kora and laid out on the canvas, a pin on one names it", async ({ browser }) => {
  const { owner, org } = await agency();
  const key = fileKey();
  const { page, errors } = await newPerson(browser);
  await signInPage(page, owner.email);
  await page.goto("/projets/7");
  await page.getByRole("button", { name: "Ajouter un livrable", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Nouveau livrable" });
  // One « Figma » kind: where the client comments is asked next, « Écrans Figma » is no kind of its own.
  await expect(dialog.locator(".kind-option")).toHaveText(["Image", "PDF", "Vidéo", "Lien", "Document", "Figma"]);
  await dialog.locator(".kind-option").filter({ hasText: /^Figma$/ }).click();
  await dialog.getByLabel("Lien du fichier Figma").fill(figmaLink(key));
  // In Kora by default: the screens of each page, a section's too.
  await expect(dialog.getByRole("radio", { name: /Dans Kora/ })).toBeChecked();
  const home = dialog.getByRole("group", { name: "Page Accueil" });
  await expect(home.getByRole("checkbox")).toHaveCount(2);
  await home.getByRole("checkbox", { name: /Accueil mobile/ }).check();
  await home.getByRole("checkbox", { name: /Accueil desktop/ }).check();
  await dialog.getByRole("group", { name: "Page Contact" }).getByRole("checkbox", { name: /Formulaire/ }).check();
  await expect(dialog.getByRole("group", { name: "Format" }).getByRole("radio", { name: /^Image/ })).toBeChecked();
  await dialog.getByRole("button", { name: "Disposer les écrans" }).click();

  // Laid out: thumbnails in Figma's order, whatever order they were ticked in; moved by keyboard and by dragging.
  const layout = page.getByRole("dialog", { name: "Disposer les écrans" });
  const tiles = layout.getByRole("list", { name: "Ordre des écrans" }).getByRole("listitem");
  const names = async () => (await tiles.evaluateAll((items) => items.map((item) => item.getAttribute("aria-label"))));
  await expect.poll(names).toEqual(["1. Accueil desktop", "2. Accueil mobile", "3. Formulaire"]);
  // Each thumbnail is the copy in Kora (its name, written under it, is its text).
  await expect.poll(() => layout.locator(".screens-layout-thumb img").first().evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
  await layout.getByRole("button", { name: "Déplacer « Formulaire » avant" }).click();
  await expect.poll(names).toEqual(["1. Accueil desktop", "2. Formulaire", "3. Accueil mobile"]);
  await tiles.nth(2).dragTo(tiles.nth(0));
  await expect.poll(names).toEqual(["1. Accueil mobile", "2. Accueil desktop", "3. Formulaire"]);
  await layout.getByRole("combobox", { name: "Écrans par ligne" }).click();
  await page.getByRole("option", { name: "2", exact: true }).click();
  await layout.getByRole("button", { name: "Importer 3 écrans" }).click();

  await page.waitForURL(/livrables\/\d+/);
  const canvas = page.getByRole("region", { name: "Canevas" });
  // In Figma's order, whatever order they were ticked in, each with its name.
  await expect(canvas.getByRole("figure")).toHaveCount(3);
  await expect(canvas.locator("figcaption")).toHaveText(["Accueil mobile", "Accueil desktop", "Formulaire"]);
  await expect(canvas.locator(".canvas-screens")).toHaveCSS("grid-template-columns", /^\S+ \S+$/);
  await expect.poll(() => canvas.getByRole("img", { name: "Accueil mobile" }).evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
  const [record] = await records(org);
  expect(record.data).toMatchObject({
    type: "Screens",
    name: `Maquette ${key}`,
    url: `https://www.figma.com/design/${key}`,
    columns: 2,
    figmaFile: { fileKey: key, fileName: `Maquette ${key}` },
    screens: [
      { id: "1:5", name: "Accueil mobile", pageName: "Accueil", width: 375, height: 812, mimeType: "image/png" },
      { id: "1:1", name: "Accueil desktop", pageName: "Accueil", width: 1440, height: 900, mimeType: "image/png" },
      { id: "2:1", name: "Formulaire", pageName: "Contact", width: 1440, height: 900, mimeType: "image/png" },
    ],
  });
  // Figma's tightest reads: the screens once, their drawing once.
  expect((await figmaReads(key)).file).toBe(2);

  // A pin on the second screen (Accueil desktop, moved there): its place names the screen.
  await page.locator("[data-page]").nth(1).click({ position: { x: 60, y: 60 } });
  await page.getByRole("textbox", { name: "Commentaire" }).fill("Le menu est trop haut");
  await page.getByRole("button", { name: "Publier" }).click();
  await expect
    .poll(async () => (await sql<{ data: Record<string, unknown> }>("select data from comments where organization_id = $1", [org]))[0]?.data)
    .toMatchObject({ page: 2, location: expect.stringMatching(/^Écran « Accueil desktop »/) });

  // A new version: the same screens copied again, in the same order, as they are in Figma now; never a file.
  const versions = page.getByRole("region", { name: "Versions" });
  await expect(versions.locator('input[type="file"]')).toHaveCount(0);
  await versions.getByRole("button", { name: "Réimporter depuis Figma" }).click();
  const again = page.getByRole("dialog", { name: "Réimporter depuis Figma" });
  await expect(again.getByRole("listitem")).toHaveText([/Accueil mobile/, /Accueil desktop/, /Formulaire/]);
  await again.getByRole("button", { name: "Réimporter" }).click();
  await expect(again).toHaveCount(0);
  await expect.poll(async () => (await records(org)).map((row) => [row.version, row.data.status, (row.data.screens as { name: string }[]).map((screen) => screen.name).join(", ")])).toEqual([
    [1, "Remplacée", "Accueil mobile, Accueil desktop, Formulaire"],
    [2, "En attente client", "Accueil mobile, Accueil desktop, Formulaire"],
  ]);
  expect((await figmaReads(key)).file).toBe(4);
  expect(errors).toEqual([]);
});

test("screens come from the server's reading and Figma's storage only, as the agency's own files; anything else is refused", async () => {
  const { owner, org } = await agency();
  const key = fileKey();

  // Not connected: said.
  const stranger = await signUp("Oscar Autre");
  await createAgency(stranger, "Studio Autre");
  expect((await call(screensApi(key), { person: stranger })).json.code).toBe("FIGMA_NOT_CONNECTED");

  const { receipt } = await readScreens(owner, key);
  // Drawing: a reading altered, a screen it does not have, too many, an unknown format; nothing drawn.
  expect((await draw(owner, key, { receipt: `${receipt}x`, ids: ["1:1"], format: "image" })).json.error).toContain("a expiré");
  expect((await draw(owner, key, { receipt, ids: ["9:9"], format: "image" })).json.error).toContain("n’est pas dans le fichier Figma");
  expect((await draw(owner, key, { receipt, ids: Array.from({ length: 31 }, (_, index) => `1:${index}`), format: "image" })).status).toBe(400);
  expect((await draw(owner, key, { receipt, ids: ["1:1"], format: "gif" })).status).toBe(400);
  const blank = fileKey("Blank");
  expect((await draw(owner, blank, { receipt: (await readScreens(owner, blank)).receipt, ids: ["1:1"], format: "image" })).status).toBe(502);

  // Storing: a ticket altered or of another agency, a screen Figma did not draw.
  const { ticket } = (await draw(owner, key, { receipt, ids: ["1:1", "2:1"], format: "image" })).json as { ticket: string };
  expect((await store(owner, key, { ticket: `${ticket}x`, id: "1:1" })).json.error).toContain("a expiré");
  expect((await store(owner, key, { ticket, id: "3:1" })).status).toBe(404);
  await connectFigma(stranger);
  expect((await store(stranger, key, { ticket, id: "1:1" })).json.error).toContain("a expiré");
  const first = (await store(owner, key, { ticket, id: "1:1" })).json as { fileData: string; mimeType: string };
  expect(first.mimeType).toBe("image/png");
  const second = (await store(owner, key, { ticket, id: "2:1" })).json.fileData as string;

  // Making the deliverable: its screens as read, its files the agency's own, of one format.
  const pdf = (await copied(owner, key, ["3:1"], "pdf")).screens[0];
  expect((await sql<{ mime_type: string }>("select mime_type from stored_files where id = $1", [pdf.fileData.split("/").at(-1)]))[0].mime_type).toBe("application/pdf");
  const othersFile = (await copied(stranger, key, ["1:1"])).screens[0].fileData;
  const refusals: [Record<string, unknown>, number, string?][] = [
    [{ receipt: `${receipt}x`, screens: [{ id: "1:1", fileData: first.fileData }] }, 400, "a expiré"],
    [{ receipt, screens: [{ id: "9:9", fileData: first.fileData }] }, 400, "n’est pas dans le fichier Figma"],
    [{ receipt, screens: [{ id: "1:1", fileData: othersFile }] }, 404],
    [{ receipt, screens: [{ id: "1:1", fileData: first.fileData }, { id: "3:1", fileData: pdf.fileData }] }, 400, "tous des images, ou tous des PDF"],
    [{ receipt, screens: [{ id: "1:1", fileData: first.fileData }, { id: "1:1", fileData: second }] }, 400],
    [{ receipt, screens: [] }, 400],
  ];
  for (const [body, status, error] of refusals) {
    const refused = await createScreens(owner, key, body);
    expect(refused.status, JSON.stringify(body).slice(0, 120)).toBe(status);
    if (error) expect(refused.json.error).toContain(error);
  }
  expect(await records(org)).toEqual([]);

  // Their names and sizes are the server's reading, never what the page says.
  const made = await createScreens(owner, key, { receipt, screens: [{ id: "2:1", fileData: second, name: "Piraté", width: 1 }, { id: "1:1", fileData: first.fileData }] });
  expect(made.status).toBe(200);
  const [record] = await records(org);
  expect((record.data.screens as { name: string; width: number }[]).map((screen) => [screen.name, screen.width])).toEqual([
    ["Formulaire", 1440],
    ["Accueil desktop", 1440],
  ]);
  expect(record.data.columns).toBe(2);
});

test("a new version copies the screens again; the client sees the shared version's screens, never another's; the proof keeps each one", async ({ browser }) => {
  const { owner, org } = await agency();
  const key = fileKey();
  const v1 = await copied(owner, key, ["1:1", "1:5"], "image", { livrableId: 500, version: 1 });
  expect((await createScreens(owner, key, { receipt: v1.receipt, screens: v1.screens })).status).toBe(200);
  const v2 = await copied(owner, key, ["1:1", "1:5"], "pdf", { livrableId: 500, version: 2 });
  // A version of « Écrans Figma » is screens again: not a file, not another file's screens.
  const pdfFile = (await upload(owner, makePdf("Cahier"), "doc.pdf", { kind: "version", projectId: 7, livrableId: 500, version: 2 })).json.href;
  expect(pdfFile).toMatch(/^\/api\/files\//);
  expect((await call("/api/deliverables/500/versions", { person: owner, body: { type: "PDF", size: 100, fileData: pdfFile } })).status).toBe(400);
  const next = await call("/api/deliverables/500/versions", { person: owner, body: { type: "Screens", receipt: v2.receipt, screens: v2.screens, columns: 1 } });
  expect(next.status).toBe(200);
  const rows = await records(org);
  expect(rows.map((row) => [row.version, row.data.status, (row.data.screens as { mimeType: string }[])[0].mimeType])).toEqual([
    [1, "Remplacée", "image/png"],
    [2, "En attente client", "application/pdf"],
  ]);

  // The client of V2 opens its screens, not V1's.
  const token = unique("tok-screens");
  const v2Id = next.json.id as number;
  await seedState(owner, { maps: { reviewLinks: { upsert: { [`${v2Id}:2`]: { token, active: true, expiresAt: "01/01/2099", autoExpire: true, deliverableId: v2Id, version: 2 } }, remove: [] } } });
  const email = `${unique("claire")}@client.test`;
  await call("/api/review-access/invite", { person: owner, body: { linkKey: `${v2Id}:2`, emails: [email] } });
  const client = await verifiedClient(token, email);
  expect((await call(v2.screens[0].fileData, { person: client })).status).toBe(302);
  expect((await call(v1.screens[0].fileData, { person: client })).status).toBe(404);
  const { page, errors } = await newPerson(browser);
  const [name, value] = client.cookie.split(";")[0].split("=");
  await page.context().addCookies([{ name, value, url: baseURL }]);
  await page.goto(`/review/${token}`);
  await expect(page.getByRole("region", { name: "Canevas" }).locator("figcaption")).toHaveText(["Accueil desktop", "Accueil mobile"]);
  expect(errors).toEqual([]);

  // The proof of V2: each screen, its page and its fingerprint.
  const proof = (await call(`/api/proof/${v2Id}`, { person: owner })).json as { deliverable: { screens: { name: string; page: string; sha256: string | null }[] } };
  expect(proof.deliverable.screens.map((screen) => [screen.name, screen.page])).toEqual([
    ["Accueil desktop", "Accueil"],
    ["Accueil mobile", "Accueil"],
  ]);
  expect(proof.deliverable.screens.every((screen) => /^[0-9a-f]{64}$/.test(screen.sha256 ?? ""))).toBe(true);
});
