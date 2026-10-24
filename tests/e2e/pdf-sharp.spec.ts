// A PDF page zoomed in on the canvas is drawn finer (src/components/SharpPdfPage.tsx), without filling the
// browser's memory: by steps, once the zoom has settled, only for the pages in view, within a budget of pixels
// per page; zoomed out, the finer copies go.

import { expect, test } from "@playwright/test";
import { pixelBudget, sharpRatio } from "../../src/lib/pdfSharpness";
import { createAgency, makePdf, newPerson, seedState, signInPage, signUp, upload } from "./helpers";

test("the finer copy's resolution: by steps from 115 % on, times the screen's density, never past the budget", () => {
  expect(sharpRatio(1, 665, 900, 1)).toBeNull();
  expect(sharpRatio(1.1, 665, 900, 2)).toBeNull();
  expect(sharpRatio(1.4, 665, 900, 1)).toBe(1.5);
  expect(sharpRatio(1.8, 665, 900, 1)).toBe(2);
  expect(sharpRatio(2.5, 665, 900, 1)).toBe(3);
  // A dense screen at 200 %: four times the page's size, which still fits the budget.
  expect(sharpRatio(2, 665, 900, 2)).toBe(4);
  // A big page zoomed far: as fine as the budget allows, never more.
  for (const [zoom, width, height, density] of [
    [4, 2000, 3000, 2],
    [4, 860, 1113, 2],
    [3, 1440, 6000, 1],
  ])
    expect((sharpRatio(zoom, width, height, density) ?? 0) ** 2 * width * height).toBeLessThanOrEqual(pixelBudget + 1);
  // Too big for the budget to make it finer at all: no copy.
  expect(sharpRatio(4, 4000, 4000, 1)).toBeNull();
});

test("zoomed in, the PDF pages in view get a finer copy over them, the others none; zoomed out, the copies go", async ({ browser }) => {
  const alice = await signUp("Alice Martin");
  await createAgency(alice, "Studio Net");
  const pdf = (await upload(alice, makePdf("Cahier", 6), "cahier.pdf", { kind: "version", projectId: 1, livrableId: 1, version: 1 })).json.href;
  await seedState(alice, {
    lists: {
      clients: { upsert: [{ id: 1, name: "Northwind" }], remove: [] },
      projects: { upsert: [{ id: 1, name: "Refonte", clientId: 1, client: "Northwind", status: "En cours" }], remove: [] },
      deliverables: { upsert: [{ id: 1, projectId: 1, name: "cahier.pdf", type: "PDF", version: 1, status: "En attente client", locked: false, importedAt: "x", size: 1, fileData: pdf }], remove: [] },
    },
  });
  const { page, errors } = await newPerson(browser);
  await signInPage(page, alice.email);
  await page.goto("/projets/1/livrables/1");
  await expect(page.locator(".react-pdf__Page canvas")).toHaveCount(6);
  const layers = page.locator(".pdf-sharp-layer");
  await expect(layers).toHaveCount(0);

  // The canvas's zoom, as its button shows it; reached by clicks, whatever the zoom it fitted the page at first.
  const zoomIn = page.getByRole("button", { name: "Augmenter le zoom" });
  const zoomOut = page.getByRole("button", { name: "Réduire le zoom" });
  const level = async () => parseInt(await page.locator("button.zoom").innerText(), 10);
  // The zoom is animated: read once it holds still between two looks.
  async function settled() {
    let last = -1;
    await expect.poll(async () => last === (last = await level()), { intervals: [150] }).toBe(true);
    return last;
  }
  async function zoomUntil(reached: (zoom: number) => boolean, button: typeof zoomIn) {
    for (let click = 0; click < 20 && !reached(await settled()); click++) await button.click();
    expect(reached(await settled())).toBe(true);
  }

  // Zoomed in: once settled, a finer copy for each page in view, and only for them.
  await zoomUntil((zoom) => zoom >= 200, zoomIn);
  await expect.poll(() => layers.count()).toBeGreaterThan(0);
  const report = await page.evaluate(() => {
    const window_ = document.querySelector(".artboard-transform-wrapper")!.getBoundingClientRect();
    return [...document.querySelectorAll(".pdf-sharp-frame")].map((frame) => {
      const box = frame.getBoundingClientRect();
      const visible = box.bottom > window_.top && box.top < window_.bottom && box.right > window_.left && box.left < window_.right;
      const base = frame.querySelector(":scope > .react-pdf__Page canvas") as HTMLCanvasElement;
      const copy = frame.querySelector(".pdf-sharp-layer canvas") as HTMLCanvasElement | null;
      return { visible, sharp: Boolean(copy), finer: copy ? copy.width / base.width : 0 };
    });
  });
  expect(report.filter((entry) => entry.sharp).every((entry) => entry.visible)).toBe(true);
  expect(report.filter((entry) => entry.sharp).length).toBeLessThan(6);
  await expect.poll(async () => page.locator(".pdf-sharp-layer canvas").first().evaluate((canvas: HTMLCanvasElement) => canvas.width)).toBeGreaterThan(0);
  const finer = await page.evaluate(() => {
    const frame = document.querySelector(".pdf-sharp-layer")!.closest(".pdf-sharp-frame")!;
    return (frame.querySelector(".pdf-sharp-layer canvas") as HTMLCanvasElement).width / (frame.querySelector(":scope > .react-pdf__Page canvas") as HTMLCanvasElement).width;
  });
  // At least the first step (×1.5), give or take the rounding of a canvas to whole pixels.
  expect(finer).toBeGreaterThan(1.45);

  // No white flash: a copy still drawing lets the page under it show (react-pdf's page is white otherwise).
  expect(await page.locator(".pdf-sharp-layer .react-pdf__Page").first().evaluate((element) => getComputedStyle(element).backgroundColor)).toBe("rgba(0, 0, 0, 0)");
  // A further step: the copy of the previous one stays until the next is drawn, then a single, finer copy.
  await zoomUntil((zoom) => zoom >= 320, zoomIn);
  await expect
    .poll(() => page.evaluate(() => [...document.querySelectorAll(".pdf-sharp-frame")].every((frame) => frame.querySelectorAll(".pdf-sharp-layer").length <= 1)))
    .toBe(true);
  await expect.poll(() => page.locator(".pdf-sharp-layer").first().getAttribute("data-ratio").then(Number)).toBeGreaterThan(finer);

  // Zoomed out again: the copies go, and their memory with them.
  await zoomUntil((zoom) => zoom <= 100, zoomOut);
  await expect(layers).toHaveCount(0);
  expect(errors).toEqual([]);
});
