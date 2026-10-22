// Comparing two versions of a deliverable (US-053), for the agency and the client: the pipeline of
// versions, side by side or behind a curtain, the requests of the older one on it. The client gets only
// the versions shared with them; a version between them not shared is a number in the pipeline, nothing
// more.

import { deflateSync, crc32 } from "node:zlib";
import { expect, test, type Browser } from "@playwright/test";
import { baseURL } from "../../playwright.config";
import { call, createAgency, makePdf, newPerson, seedState, signInPage, signUp, unique, upload, verifiedClient, type Member } from "./helpers";

/** A PNG of `width`×`height`, each pixel painted by `paint` (the tests' own mock-ups). */
function png(width: number, height: number, paint: (x: number, y: number) => [number, number, number]) {
  const rows = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) rows.set(paint(x, y), y * (width * 3 + 1) + 1 + x * 3);
  const chunk = (type: string, data: Buffer) => {
    const head = Buffer.alloc(4);
    head.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc32(body));
    return Buffer.concat([head, body, sum]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", header), chunk("IDAT", deflateSync(rows)), chunk("IEND", Buffer.alloc(0))]);
}

/** A mock-up with its logo (a dark block) at `left`, in %. */
const mockup = (left: number) => png(320, 200, (x, y) => (x > left * 3.2 && x < left * 3.2 + 60 && y > 20 && y < 60 ? [30, 30, 30] : [240, 236, 228]));

/**
 * Three versions of « maquette.png »: V1 shared with Claire (her request, and a draft of the agency),
 * V2 shared with nobody (a request on it), V3 shared with Claire.
 */
async function threeVersions() {
  const alice = await signUp("Alice Martin");
  await createAgency(alice, "Studio Versions");
  const files: string[] = [];
  for (const version of [1, 2, 3]) files.push((await upload(alice, mockup(version * 20), "maquette.png", { kind: "version", projectId: 1, livrableId: 1, version })).json.href!);
  const record = (version: number, status: string) => ({ id: version, projectId: 1, name: "maquette.png", type: "Image", version, fileData: files[version - 1], status, importedAt: "22/10/2026 10:00", locked: version < 3 });
  const [t1, t3] = [unique("tok-v1"), unique("tok-v3")];
  const link = (token: string, version: number) => ({ token, active: true, expiresAt: "01/01/2099", autoExpire: true, deliverableId: version, version });
  await seedState(alice, {
    lists: {
      clients: { upsert: [{ id: 1, name: "Northwind" }], remove: [] },
      projects: { upsert: [{ id: 1, name: "Refonte", clientId: 1, client: "Northwind", status: "En cours" }], remove: [] },
      deliverables: { upsert: [record(1, "Remplacée"), record(2, "Remplacée"), record(3, "En attente client")], remove: [] },
      comments: {
        upsert: [
          { id: 10, deliverableId: 1, author: "Claire Dubois", initials: "CD", from: "client", authorEmail: "claire@client.test", message: "Agrandir le logo", decision: "À qualifier", kind: "remark", location: "Page 1", page: 1, position: { x: 20, y: 20 }, time: "t" },
          { id: 11, deliverableId: 1, author: "Alice Martin", initials: "AM", from: "agency", message: "Brouillon interne de l’agence", decision: "À qualifier", kind: "remark", internalNote: true, location: "Page 1", page: 1, position: { x: 70, y: 60 }, time: "t" },
          { id: 12, deliverableId: 2, author: "Alice Martin", initials: "AM", from: "agency", message: "Essai jamais partagé", title: "Essai jamais partagé", decision: "Inclus", kind: "request", location: "Page 1", page: 1, position: { x: 50, y: 50 }, time: "t" },
        ],
        remove: [],
      },
    },
    maps: { reviewLinks: { upsert: { "1:1": link(t1, 1), "3:3": link(t3, 3) }, remove: [] } },
  });
  const email = `${unique("claire")}@client.test`;
  for (const linkKey of ["1:1", "3:3"]) await call("/api/review-access/invite", { person: alice, body: { linkKey, emails: [email] } });
  return { alice, t1, t3, email };
}

const versionsOf = async (person: { cookie: string; ip: string } | undefined, token: string) => call(`/api/review/${token}/versions`, { person });

test("a client gets only the versions shared with them, each with only what they may see; anyone else, nothing", async () => {
  const { alice, t1, t3, email } = await threeVersions();
  const claire = await verifiedClient(t3, email);
  const answer = await versionsOf(claire, t3);
  expect(answer.status).toBe(200);
  const versions = answer.json.versions as { version: number; current: boolean; comments: { id: number }[] }[];
  expect(versions.map((version) => [version.version, version.current])).toEqual([
    [1, false],
    [3, true],
  ]);
  // Her own request on V1; neither the agency's draft there nor anything of V2.
  expect(versions[0].comments.map((comment) => comment.id)).toEqual([10]);
  expect(JSON.stringify(answer.json)).not.toContain("Brouillon interne");
  expect(JSON.stringify(answer.json)).not.toContain("Essai jamais partagé");

  // Not verified, or the agency's preview: nothing.
  expect((await versionsOf(undefined, t3)).status).toBe(404);
  expect((await versionsOf(alice, t3)).status).toBe(404);
  // Someone invited on V3 only: V3 only.
  const dana = `${unique("dana")}@client.test`;
  await call("/api/review-access/invite", { person: alice, body: { linkKey: "3:3", emails: [dana] } });
  const danaPerson = await verifiedClient(t3, dana);
  expect(((await versionsOf(danaPerson, t3)).json.versions as { version: number }[]).map((version) => version.version)).toEqual([3]);
  // V1's link revoked: V1 is no longer hers to compare.
  await seedState(alice, { maps: { reviewLinks: { upsert: { "1:1": { token: t1, active: false, expiresAt: "01/01/2099", autoExpire: true, deliverableId: 1, version: 1 } }, remove: [] } } });
  expect(((await versionsOf(claire, t3)).json.versions as { version: number }[]).map((version) => version.version)).toEqual([3]);
});

async function clientPage(browser: Browser, token: string, email: string) {
  const client = await verifiedClient(token, email);
  const { page, errors } = await newPerson(browser);
  const [name, value] = client.cookie.split(";")[0].split("=");
  await page.context().addCookies([{ name, value, url: baseURL }]);
  await page.goto(`/review/${token}`);
  return { page, errors };
}

test("the client compares their versions: the pipeline, V2 a number alone, their request on V1, the curtain", async ({ browser }) => {
  const { t3, email } = await threeVersions();
  const { page, errors } = await clientPage(browser, t3, email);
  await page.getByRole("button", { name: "Comparer les versions" }).click();
  const compare = page.getByRole("dialog", { name: "Comparer les versions" });
  const pipeline = compare.getByRole("list", { name: "Versions" });
  await expect(pipeline.getByRole("button", { name: "V01, avant" })).toHaveAttribute("aria-pressed", "true");
  await expect(pipeline.getByRole("button", { name: "V03, après" })).toHaveAttribute("aria-pressed", "true");
  // V2 is not hers: its number, nothing to choose, nothing of it loaded.
  await expect(pipeline.getByLabel("V02, non partagée avec vous")).toBeVisible();
  await expect(pipeline.getByRole("button", { name: /^V02/ })).toHaveCount(0);
  // Side by side: the two mock-ups, her request where she placed it on V1.
  await expect(compare.getByRole("img", { name: "maquette.png, V01" })).toBeVisible();
  await expect(compare.getByRole("img", { name: "maquette.png, V03" })).toBeVisible();
  const before = compare.getByRole("region", { name: "Avant : V01" });
  await before.getByRole("button", { name: /Commentaire #10/ }).click();
  await expect(compare.locator("footer")).toContainText("Agrandir le logo");
  await expect(compare.getByRole("button", { name: /#11/ })).toHaveCount(0);
  // The curtain: V3 over V1 from the handle to the right.
  await compare.getByRole("button", { name: "Rideau" }).click();
  await compare.getByRole("slider", { name: "Position du rideau" }).fill("20");
  await expect(compare.locator(".compare-over")).toHaveAttribute("style", /inset\(0px 0px 0px 20%\)|inset\(0 0 0 20%\)/);
  await page.keyboard.press("Escape");
  await expect(compare).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("the agency compares any two of its versions, unshared ones and its drafts included", async ({ browser }) => {
  const { alice } = await threeVersions();
  const { page, errors } = await newPerson(browser);
  await signInPage(page, alice.email);
  await page.goto("/projets/1/livrables/3");
  await expect(page.locator("[data-page]").first()).toBeVisible();
  await page.getByRole("button", { name: "Actions du livrable maquette.png" }).click();
  await page.getByRole("menuitem", { name: "Comparer les versions" }).click();
  const compare = page.getByRole("dialog", { name: "Comparer les versions" });
  const pipeline = compare.getByRole("list", { name: "Versions" });
  // The previous version and the one open; V2 said unshared, but the agency's to choose.
  await expect(pipeline.getByRole("button", { name: /^V02, avant · non partagée/ })).toBeVisible();
  await expect(pipeline.getByRole("button", { name: /^V03, après/ })).toBeVisible();
  await pipeline.getByRole("button", { name: /^V01/ }).click();
  await expect(pipeline.getByRole("button", { name: /^V01, avant/ })).toBeVisible();
  // On V1, the client's request and the agency's own draft.
  const before = compare.getByRole("region", { name: "Avant : V01" });
  await expect(before.getByRole("button", { name: /Commentaire #10/ })).toBeVisible();
  await expect(before.getByRole("button", { name: /#11/ })).toBeVisible();
  await compare.getByRole("button", { name: "Fermer la comparaison" }).click();
  await expect(compare).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("one version, or one that is not an image or a PDF: nothing to compare", async ({ browser }) => {
  const alice: Member = await signUp("Alice Martin");
  await createAgency(alice, "Studio Seul");
  const href = (await upload(alice, mockup(10), "maquette.png", { kind: "version", projectId: 1, livrableId: 1, version: 1 })).json.href!;
  await seedState(alice, {
    lists: {
      clients: { upsert: [{ id: 1, name: "Northwind" }], remove: [] },
      projects: { upsert: [{ id: 1, name: "Refonte", clientId: 1, client: "Northwind", status: "En cours" }], remove: [] },
      deliverables: { upsert: [{ id: 1, projectId: 1, name: "maquette.png", type: "Image", version: 1, fileData: href, status: "En attente client", importedAt: "22/10/2026 10:00", locked: false }], remove: [] },
    },
  });
  const { page } = await newPerson(browser);
  await signInPage(page, alice.email);
  await page.goto("/projets/1/livrables/1");
  await expect(page.locator("[data-page]").first()).toBeVisible();
  await page.getByRole("button", { name: "Actions du livrable maquette.png" }).click();
  await expect(page.getByRole("menuitem", { name: /Importer une nouvelle version/ })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Comparer les versions" })).toHaveCount(0);
});


test("two PDFs are compared page by page; a different number of pages is said", async ({ browser }) => {
  const alice = await signUp("Alice Martin");
  await createAgency(alice, "Studio Dossier");
  const files: string[] = [];
  for (const [version, pages] of [[1, 2], [2, 3]]) files.push((await upload(alice, makePdf(`Dossier V${version}`, pages), "dossier.pdf", { kind: "version", projectId: 1, livrableId: 1, version })).json.href!);
  const record = (version: number) => ({ id: version, projectId: 1, name: "dossier.pdf", type: "PDF", version, fileData: files[version - 1], status: version === 1 ? "Remplacée" : "En attente client", importedAt: "22/10/2026 10:00", locked: version === 1 });
  await seedState(alice, {
    lists: {
      clients: { upsert: [{ id: 1, name: "Northwind" }], remove: [] },
      projects: { upsert: [{ id: 1, name: "Refonte", clientId: 1, client: "Northwind", status: "En cours" }], remove: [] },
      deliverables: { upsert: [record(1), record(2)], remove: [] },
      comments: { upsert: [{ id: 20, deliverableId: 1, author: "Claire Dubois", initials: "CD", from: "client", message: "Revoir le sommaire", decision: "À qualifier", kind: "remark", location: "Page 2", page: 2, position: { x: 30, y: 30 }, time: "t" }], remove: [] },
    },
  });
  const { page, errors } = await newPerson(browser);
  await signInPage(page, alice.email);
  await page.goto("/projets/1/livrables/2");
  await expect(page.locator(".react-pdf__Page canvas").first()).toBeVisible();
  await page.getByRole("button", { name: "Actions du livrable dossier.pdf" }).click();
  await page.getByRole("menuitem", { name: "Comparer les versions" }).click();
  const compare = page.getByRole("dialog", { name: "Comparer les versions" });
  // Every page of each, one under the other; the request of V1's second page on it.
  await expect(compare.getByRole("region", { name: "Avant : V01" }).locator(".react-pdf__Page")).toHaveCount(2);
  await expect(compare.getByRole("region", { name: "Après : V02" }).locator(".react-pdf__Page")).toHaveCount(3);
  await expect(compare.getByRole("note")).toContainText("La V02 a 3 pages, la V01 en avait 2");
  await compare.getByRole("region", { name: "Avant : V01" }).getByRole("button", { name: /Commentaire #20/ }).click();
  await expect(compare.locator("footer")).toContainText("Revoir le sommaire");
  // Behind the curtain too.
  await compare.getByRole("button", { name: "Rideau" }).click();
  await expect(compare.getByRole("region", { name: /Rideau/ }).locator(".react-pdf__Page")).toHaveCount(5);
  expect(errors).toEqual([]);
});
