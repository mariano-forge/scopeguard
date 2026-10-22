// A video deliverable on the review canvas: it plays in Kora, and a comment is pinned on a moment of it,
// at a place in the picture (US-052).
//
// fixtures/eight-seconds.webm: 8 seconds, one colour and its second's number per second (WebM, which the
// tests' Chromium plays; it has no H.264).

import { readFileSync } from "node:fs";
import { expect, test, type Browser } from "@playwright/test";
import { baseURL } from "../../playwright.config";
import { call, clientAction, createAgency, newPerson, seedState, signInPage, signUp, sql, unique, upload, verifiedClient, type Member } from "./helpers";

const film = readFileSync("tests/e2e/fixtures/eight-seconds.webm");

async function videoDeliverable() {
  const alice = await signUp("Alice Martin");
  await createAgency(alice, "Studio Image");
  const { href } = (await upload(alice, film, "film.webm", { kind: "version", projectId: 1, livrableId: 1, version: 1 })).json;
  const token = unique("tok-video");
  await seedState(alice, {
    maps: { reviewLinks: { upsert: { "1:1": { token, active: true, expiresAt: "01/01/2099", autoExpire: true, deliverableId: 1, version: 1 } }, remove: [] } },
    lists: {
      clients: { upsert: [{ id: 1, name: "Northwind" }], remove: [] },
      projects: { upsert: [{ id: 1, name: "Refonte", clientId: 1, client: "Northwind", status: "En cours" }], remove: [] },
      deliverables: {
        upsert: [{ id: 1, projectId: 1, name: "film.webm", type: "Video", fileData: href, version: 1, status: "En attente client", importedAt: "22/10/2026 10:00", locked: false }],
        remove: [],
      },
    },
  });
  return { alice, org: alice.organizationId!, token };
}

async function openEditor(browser: Browser, member: Member) {
  const { page, errors } = await newPerson(browser);
  await signInPage(page, member.email);
  await page.goto("/projets/1/livrables/1");
  const video = page.locator("[data-page] video");
  await expect(video).toBeVisible();
  return { page, errors, video };
}

test("a video deliverable plays on the canvas", async ({ browser }) => {
  const { alice } = await videoDeliverable();
  const { page, errors, video } = await openEditor(browser, alice);
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.duration)).toBeCloseTo(8, 0);
  await video.evaluate((element: HTMLVideoElement) => {
    element.muted = true;
    return element.play();
  });
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime)).toBeGreaterThan(0.5);
  expect(errors).toEqual([]);
  await page.close();
});

const commentsOf = (org: string, from: string) =>
  sql<{ id: string; data: Record<string, unknown> }>("select id, data from comments where organization_id = $1 and data->>'from' = $2 order by id", [org, from]);
const timeOf = (video: ReturnType<Awaited<ReturnType<typeof openEditor>>["page"]["locator"]>) => video.evaluate((element: HTMLVideoElement) => element.currentTime);

test("the agency pins a comment on a moment of the video; its mark on the timeline brings the video back there", async ({ browser }) => {
  const { alice, org } = await videoDeliverable();
  const { page, errors, video } = await openEditor(browser, alice);
  const bar = page.getByRole("group", { name: "Lecture de la vidéo" });
  await expect(bar.getByRole("slider", { name: "Position dans la vidéo" })).toBeEnabled();
  // Played, then paused on the picture by the comment: the moment is the one shown.
  await bar.getByRole("slider", { name: "Position dans la vidéo" }).fill("3");
  await expect.poll(() => timeOf(video)).toBeCloseTo(3, 1);
  await page.locator("[data-page]").first().click({ position: { x: 120, y: 60 } });
  await page.getByRole("textbox", { name: "Commentaire" }).fill("Le logo arrive trop tard");
  await page.getByRole("button", { name: "Publier" }).click();
  await expect.poll(async () => (await commentsOf(org, "agency"))[0]?.data).toMatchObject({ message: "Le logo arrive trop tard", timecode: 3, location: "Vidéo · 0:03", page: 1 });
  const [created] = await commentsOf(org, "agency");
  expect(created.data.position).toBeTruthy();
  const id = Number(created.id);
  // Its thread and its row in the panel say when.
  const thread = page.getByRole("dialog", { name: `Commentaire #${id}` });
  await expect(thread.getByText("À 0:03 dans la vidéo")).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Demandes" }).getByRole("button", { name: `Commentaire #${id}` })).toContainText("0:03");
  await thread.getByRole("button", { name: "Fermer" }).click();

  // Elsewhere in the video, the pin leaves the picture; its mark stays on the timeline.
  await bar.getByRole("slider", { name: "Position dans la vidéo" }).fill("7");
  await expect.poll(() => timeOf(video)).toBeCloseTo(7, 1);
  await expect(page.locator(`[data-pin="${id}"]`)).toHaveCount(0);
  const mark = bar.getByRole("button", { name: `Commentaire #${id} à 0:03` });
  await mark.click();
  // The mark opens the comment, the video at its moment, paused: the pin is back.
  await expect(thread).toBeVisible();
  await expect.poll(() => timeOf(video)).toBeCloseTo(3, 1);
  expect(await video.evaluate((element: HTMLVideoElement) => element.paused)).toBe(true);
  await expect(page.locator(`[data-pin="${id}"]`)).toBeVisible();
  await expect(mark).toHaveAttribute("aria-current", "true");

  // The same from the panel's list, from anywhere in the video.
  await thread.getByRole("button", { name: "Fermer" }).click();
  await bar.getByRole("slider", { name: "Position dans la vidéo" }).fill("6");
  await expect.poll(() => timeOf(video)).toBeCloseTo(6, 1);
  await page.getByRole("complementary", { name: "Demandes" }).getByRole("button", { name: `Commentaire #${id}` }).click();
  await expect.poll(() => timeOf(video)).toBeCloseTo(3, 1);
  expect(errors).toEqual([]);
});

test("the client pins a comment on a moment of the video, which the agency sees there", async ({ browser }) => {
  const { alice, org, token } = await videoDeliverable();
  const email = `${unique("claire")}@client.test`;
  await call("/api/review-access/invite", { person: alice, body: { linkKey: "1:1", emails: [email] } });
  const client = await verifiedClient(token, email, "Claire Dubois");
  const { page, errors } = await newPerson(browser);
  const [name, value] = client.cookie.split(";")[0].split("=");
  await page.context().addCookies([{ name, value, url: baseURL }]);
  await page.goto(`/review/${token}`);
  const video = page.locator("[data-page] video");
  await expect(video).toBeVisible();
  const bar = page.getByRole("group", { name: "Lecture de la vidéo" });
  await bar.getByRole("slider", { name: "Position dans la vidéo" }).fill("5");
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime)).toBeCloseTo(5, 1);
  await page.locator("[data-page]").first().click({ position: { x: 100, y: 50 } });
  await page.getByRole("textbox", { name: "Commentaire" }).fill("Une coquille dans le sous-titre");
  await page.getByRole("button", { name: "Publier" }).click();
  await expect.poll(async () => (await commentsOf(org, "client"))[0]?.data).toMatchObject({ message: "Une coquille dans le sous-titre", timecode: 5, location: "Vidéo · 0:05", authorEmail: email });
  const id = Number((await commentsOf(org, "client"))[0].id);
  expect(errors).toEqual([]);

  // In Kora, the agency finds it at its moment.
  const agency = await openEditor(browser, alice);
  await agency.page.getByRole("group", { name: "Lecture de la vidéo" }).getByRole("button", { name: `Commentaire #${id} à 0:05` }).click();
  await expect.poll(() => agency.video.evaluate((element: HTMLVideoElement) => element.currentTime)).toBeCloseTo(5, 1);
  await expect(agency.page.getByRole("dialog", { name: `Commentaire #${id}` })).toBeVisible();
  expect(agency.errors).toEqual([]);
});

test("a moment that is not one is not kept, on either side; the client never changes the agency's", async () => {
  const { alice, org, token } = await videoDeliverable();
  for (const timecode of [-1, "12", 1e9, null]) {
    const created = await call("/api/comments", { person: alice, body: { deliverableId: 1, message: `Moment ${String(timecode)}`, page: 1, position: { x: 10, y: 10 }, timecode } });
    expect(created.status).toBe(200);
  }
  expect((await commentsOf(org, "agency")).every((row) => row.data.timecode === undefined)).toBe(true);
  // To the tenth, as the canvas sends it.
  await call("/api/comments", { person: alice, body: { deliverableId: 1, message: "Au dixième", page: 1, position: { x: 10, y: 10 }, timecode: 2.345 } });
  const precise = (await commentsOf(org, "agency")).find((row) => row.data.message === "Au dixième")!;
  expect(precise.data.timecode).toBe(2.3);

  const email = `${unique("claire")}@client.test`;
  await call("/api/review-access/invite", { person: alice, body: { linkKey: "1:1", emails: [email] } });
  const client = await verifiedClient(token, email);
  expect((await clientAction(client, token, "comments", "POST", { message: "Trop loin", page: 1, position: { x: 5, y: 5 }, timecode: -3 })).status).toBe(200);
  expect((await commentsOf(org, "client"))[0].data.timecode).toBeUndefined();
  // Moving an agency's pin, or a field it does not own: refused, its moment unchanged.
  expect((await clientAction(client, token, `comments/${precise.id}`, "PATCH", { page: 1, x: 50, y: 50 })).status).toBe(404);
  expect((await commentsOf(org, "agency")).find((row) => row.id === precise.id)!.data.timecode).toBe(2.3);
});

test("a video has its own size limit, for a version only", async () => {
  const alice = await signUp("Alice Martin");
  await createAgency(alice, "Studio Poids");
  // In the tests, 1 MB for a file (MAX_UPLOAD_MB) and 12 MB for a video (MAX_VIDEO_UPLOAD_MB).
  const prepare = (type: string, size: number, kind = "version") =>
    call("/api/files/upload", { person: alice, body: { name: "film", type, size, sha256: "a".repeat(64), kind, projectId: 1, livrableId: 1, version: 1 } });
  expect((await prepare("video/mp4", 1.5 * 1024 * 1024)).status).toBe(200);
  const tooLarge = await prepare("video/mp4", 12.5 * 1024 * 1024);
  expect(tooLarge.status).toBe(413);
  expect(tooLarge.json.error).toContain("12 Mo");
  // Another file, or a video as a cover: the general limit.
  expect((await prepare("image/png", 1.5 * 1024 * 1024)).status).toBe(413);
  expect((await prepare("video/mp4", 1.5 * 1024 * 1024, "cover")).status).toBe(413);
  // Through the server too.
  expect((await upload(alice, Buffer.alloc(1_500_000, 1), "lourd.webm", { kind: "version", projectId: 1, livrableId: 1, version: 2 })).status).toBe(200);
  expect((await upload(alice, Buffer.alloc(1_500_000, 1), "lourd.png", { kind: "version", projectId: 1, livrableId: 1, version: 3 })).status).toBe(413);
});

test("a video's comments are listed in the order of the film", async ({ browser }) => {
  const { alice } = await videoDeliverable();
  const pinned = (id: number, timecode: number, title: string) => ({
    id, deliverableId: 1, author: "Claire Dubois", initials: "CD", from: "client", message: title, title, decision: "Inclus", kind: "request",
    location: `Vidéo · 0:0${timecode}`, page: 1, position: { x: 20, y: 20 }, timecode, time: "t",
  });
  // Written last, seen first in the film.
  await seedState(alice, { lists: { comments: { upsert: [pinned(50, 6, "Fin trop longue"), pinned(51, 1, "Titre trop rapide")], remove: [] } } });
  const { page, errors } = await openEditor(browser, alice);
  const panel = page.getByRole("complementary", { name: "Demandes" });
  await panel.getByRole("tab", { name: /^Inclus/ }).click();
  const rows = panel.getByRole("listitem");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText("Titre trop rapide");
  await expect(rows.nth(1)).toContainText("Fin trop longue");
  expect(errors).toEqual([]);
});

// ——— What the import says of a video (src/lib/videoCheck.ts) ———

const screenRecording = readFileSync("tests/e2e/fixtures/screen-recording.webm");

test("the import says when a video may smear or not play, and imports it anyway", async ({ browser }) => {
  const alice = await signUp("Alice Martin");
  await createAgency(alice, "Studio Import");
  await seedState(alice, {
    lists: {
      clients: { upsert: [{ id: 1, name: "Northwind" }], remove: [] },
      projects: { upsert: [{ id: 1, name: "Refonte", clientId: 1, client: "Northwind", status: "En cours" }], remove: [] },
    },
  });
  const { page, errors } = await newPerson(browser);
  await signInPage(page, alice.email);
  await page.goto("/projets/1");
  await page.getByRole("button", { name: "Ajouter un livrable", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Nouveau livrable" });
  const file = dialog.locator(".dropzone input[type=file]").first();
  const note = dialog.getByRole("note");

  // A clean export: nothing to say.
  await file.setInputFiles({ name: "film.webm", mimeType: "video/webm", buffer: film });
  await expect(dialog.getByRole("status").filter({ hasText: "Vidéo vérifiée." })).toBeAttached();
  await expect(note).toHaveCount(0);
  // Not a video this browser plays (a ProRes, say): said, the client may not watch it.
  await file.setInputFiles({ name: "master.mov", mimeType: "video/quicktime", buffer: Buffer.alloc(4096, 7) });
  await expect(note).toContainText("Ce navigateur ne sait pas lire cette vidéo");
  // A screen recording, one key picture for 16 s: said, and imported all the same.
  await file.setInputFiles({ name: "capture.webm", mimeType: "video/webm", buffer: screenRecording });
  await expect(note).toContainText("Cette vidéo risque de « baver » quand on saute à un moment précis");
  await dialog.getByLabel("Nom du livrable").fill("Capture du prototype");
  await dialog.getByRole("button", { name: "Créer le livrable" }).click();
  await page.waitForURL(/livrables\/\d+/);
  await expect(page.locator("[data-page] video")).toBeVisible();

  // A new version that may smear: said while it uploads.
  await page.getByRole("region", { name: "Versions" }).locator('input[type="file"]').setInputFiles({ name: "capture-2.webm", mimeType: "video/webm", buffer: screenRecording });
  await expect(page.getByText("Cette vidéo risque de « baver »")).toBeVisible();
  await expect(page.getByRole("region", { name: "Versions" })).toContainText("V02");
  expect(errors).toEqual([]);
});

/** A minimal MP4 index: one video track of `samples` pictures `delta` apart (timescale 1 000), key pictures `keys` (1-based). */
function mp4(samples: number, delta: number, keys: number[] | null, indexAtEnd = false) {
  const u32 = (value: number) => {
    const buffer = Buffer.alloc(4);
    buffer.writeUInt32BE(value);
    return buffer;
  };
  const box = (type: string, ...parts: Buffer[]) => Buffer.concat([u32(8 + parts.reduce((total, part) => total + part.length, 0)), Buffer.from(type), ...parts]);
  const full = (type: string, ...parts: Buffer[]) => box(type, u32(0), ...parts);
  const table = box(
    "stbl",
    full("stts", u32(1), u32(samples), u32(delta)),
    ...(keys ? [full("stss", u32(keys.length), ...keys.map(u32))] : []),
  );
  const moov = box(
    "moov",
    box("trak", box("mdia", full("mdhd", u32(0), u32(0), u32(1000), u32(samples * delta), u32(0)), full("hdlr", u32(0), Buffer.from("vide"), Buffer.alloc(13)), box("minf", table))),
  );
  const ftyp = box("ftyp", Buffer.from("isom"), u32(0));
  const mdat = box("mdat", Buffer.alloc(64));
  return Buffer.concat(indexAtEnd ? [ftyp, mdat, moov] : [ftyp, moov, mdat]);
}

test("the key pictures' longest gap is read from the index alone, in WebM and MP4", async () => {
  const { keyPictureGap } = await import("../../src/lib/videoCheck");
  const gap = (content: Buffer, name: string) => keyPictureGap(new File([new Uint8Array(content)], name));
  expect(await gap(film, "film.webm")).toBe(1);
  expect(await gap(screenRecording, "capture.webm")).toBe(16);
  // 30 s at 25 images a second: a key picture every 2 s, or only at 0 and 15 s, its index at the start or the end.
  expect(await gap(mp4(750, 40, Array.from({ length: 15 }, (_, index) => 1 + index * 50)), "export.mp4")).toBeCloseTo(2);
  expect(await gap(mp4(750, 40, [1, 376], true), "rare.mp4")).toBeCloseTo(15);
  // No sync table: every picture is a key picture.
  expect(await gap(mp4(750, 40, null), "intra.mov")).toBe(0);
  // Not a video it knows: nothing learnt.
  expect(await gap(Buffer.alloc(64, 1), "inconnu.mp4")).toBeNull();
});

// ——— How long a video's link lasts (src/lib/storage.ts videoLinkSeconds) ———

/** Seconds from now until the read-only address /api/files answers expires. */
async function linkLifetime(member: Member, href: string) {
  const answer = await call(href, { person: member });
  expect(answer.status).toBe(302);
  const expires = new URL(answer.response.headers.get("location")!).searchParams.get("se")!;
  return (new Date(expires).getTime() - Date.now()) / 1000;
}

test("a video's link lasts its length and a quarter of an hour, 3 hours of video at most; any other file's, 5 minutes", async () => {
  const alice = await signUp("Alice Martin");
  await createAgency(alice, "Studio Durée");
  await seedState(alice, {
    lists: {
      clients: { upsert: [{ id: 1, name: "Northwind" }], remove: [] },
      projects: { upsert: [{ id: 1, name: "Refonte", clientId: 1, client: "Northwind", status: "En cours" }], remove: [] },
    },
  });
  const { href } = (await upload(alice, film, "film.webm", { kind: "version", projectId: 1, livrableId: 1, version: 1 })).json;
  // The length the agency's browser read, kept with the version, to the tenth.
  const created = await call("/api/deliverables", { person: alice, body: { id: 1, projectId: 1, name: "Film", type: "Video", size: film.length, fileData: href, duration: 8.04 } });
  expect(created.status).toBe(200);
  const duration = async (id: number) => (await sql<{ data: Record<string, unknown> }>("select data from deliverables where organization_id = $1 and id = $2", [alice.organizationId, id]))[0].data.duration;
  expect(await duration(Number(created.json.id))).toBe(8);
  expect(await linkLifetime(alice, href!)).toBeGreaterThan(8 + 15 * 60 - 60);
  expect(await linkLifetime(alice, href!)).toBeLessThan(8 + 15 * 60 + 60);

  // A length that is not one is not kept; nor one stated for something else than a video.
  for (const [index, stated] of ([-1, "8", 1e9, null] as unknown[]).entries()) {
    const other = await call("/api/deliverables", { person: alice, body: { projectId: 1, name: `Film ${index}`, type: "Video", size: film.length, fileData: href, duration: stated } });
    expect(await duration(Number(other.json.id))).toBeUndefined();
  }
  const pdf = await call("/api/deliverables", { person: alice, body: { projectId: 1, name: "Devis", type: "PDF", size: 10, fileData: href, duration: 60 } });
  expect(await duration(Number(pdf.json.id))).toBeUndefined();

  // A new version states its own.
  const recording = (await upload(alice, screenRecording, "capture.webm", { kind: "version", projectId: 1, livrableId: 1, version: 2 })).json.href!;
  const version = await call(`/api/deliverables/${created.json.id}/versions`, { person: alice, body: { type: "Video", size: screenRecording.length, fileData: recording, duration: 16 } });
  expect(await duration(Number(version.json.id))).toBe(16);

  // A film stated longer than 3 hours: its link stops at 3 hours and a quarter.
  await seedState(alice, { lists: { deliverables: { upsert: [{ id: Number(version.json.id), projectId: 1, name: "Film", type: "Video", version: 2, fileData: recording, duration: 50_000, status: "En attente client", importedAt: "x", locked: false }], remove: [] } } });
  expect(await linkLifetime(alice, recording)).toBeLessThan(3 * 3600 + 15 * 60 + 60);
  expect(await linkLifetime(alice, recording)).toBeGreaterThan(3 * 3600 + 15 * 60 - 60);

  // Any other file: 5 minutes, as before.
  const png = Buffer.from("89504e470d0a1a0a0000000d4948445200000001000000010806000000", "hex");
  const image = (await upload(alice, png, "logo.png", { kind: "cover", projectId: 1, livrableId: 1 })).json.href!;
  expect(await linkLifetime(alice, image)).toBeLessThan(5 * 60 + 60);
});

// An expired link is refused by the storage; the browser either says so (an error) or retries quietly
// (Azure's refusal, blocked by the browser: the video only waits). Both end the same way.
for (const refusal of ["refused", "never answered"] as const) test(`a video whose link expired goes on where it was, the rest ${refusal}: the canvas asks for a new link`, async ({ browser }) => {
  const { alice } = await videoDeliverable();
  const { page, errors } = await newPerson(browser);
  // The first link gives what a video needs to show (its header and its index, at both ends of the file),
  // then has expired: no piece of the film itself. A new request from the start (the canvas asking for a
  // new link) is answered as usual.
  let links = 0;
  await page.route(/\/api\/files\//, async (route) => {
    const start = Number(/bytes=(\d+)/.exec(route.request().headers()["range"] ?? "")?.[1] ?? 0);
    if (start === 0 && ++links > 1) return route.continue();
    // Its first seconds and its last bytes (the index); 6 s into the film is past 40 kB of its 55.
    const ends = start < 20480 || start >= film.length - 4096;
    if (!ends) return refusal === "refused" ? route.fulfill({ status: 403, body: "AuthenticationFailed" }) : new Promise<void>(() => undefined);
    const answer = await route.fetch({ headers: { ...route.request().headers(), range: `bytes=${start}-${start + 16383}` } });
    const body = await answer.body();
    await route.fulfill({ status: 206, body, headers: { "content-type": "video/webm", "accept-ranges": "bytes", "content-range": `bytes ${start}-${start + body.length - 1}/${film.length}` } });
  });
  await signInPage(page, alice.email);
  await page.goto("/projets/1/livrables/1");
  const video = page.locator("[data-page] video");
  const bar = page.getByRole("group", { name: "Lecture de la vidéo" });
  await expect(bar.getByRole("slider", { name: "Position dans la vidéo" })).toBeEnabled();
  // Further in the film: the piece is not given, a new link is asked for, the video is there.
  await bar.getByRole("slider", { name: "Position dans la vidéo" }).fill("6");
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => ({ ready: element.readyState >= 3, time: Math.round(element.currentTime) })), { timeout: 20_000 }).toEqual({ ready: true, time: 6 });
  expect(links).toBeGreaterThanOrEqual(2);
  expect(errors).toEqual([]);
});
