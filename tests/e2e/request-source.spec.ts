// Requests the agency enters from « + Demande » with their source (an e-mail, a call…), the client's
// words and a capture (src/lib/requestSource.ts): stored, checked by the server, shown to the client,
// and kept in the proof.

import { expect, test } from "@playwright/test";
import { call, createAgency, makePdf, newPerson, seedReview, signInPage, signUp, sql, unique, upload, verifiedClient, type Member, type Person } from "./helpers";

/** A 1×1 PNG, built here so the tests need no file on disk. */
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

async function agency() {
  const alice = await signUp("Alice Martin");
  await createAgency(alice, "Studio Sources");
  const token = unique("tok-source");
  const { linkKey } = await seedReview(alice, token);
  const act = (person: Partial<Person>, body: Record<string, unknown>) => call("/api/comments", { method: "POST", person, body: { request: { deliverableId: 1, ...body } } });
  return { alice, org: alice.organizationId!, token, linkKey, act };
}

const commentData = async (org: string, id: number) =>
  (await sql<{ data: Record<string, unknown> }>("select data from comments where organization_id = $1 and id = $2", [org, id]))[0]?.data;

test("« + Demande »: received by e-mail, with the client’s words and a capture, shown in the request", async ({ browser }) => {
  const { alice, org } = await agency();
  const { page, errors } = await newPerson(browser);
  await signInPage(page, alice.email);
  await page.goto("/projets/1/livrables/1");
  await expect(page.locator("[data-page]").first()).toBeVisible();

  await page.getByRole("button", { name: "Demande", exact: true }).click();
  // Opened from the « À clarifier » tab: that choice comes first.
  await expect(page.getByRole("heading", { name: "Nouvelle demande" })).toBeVisible();
  const dialog = page;
  await expect(dialog.getByRole("radio", { name: /^À clarifier/ })).toBeChecked();
  await dialog.getByRole("radio", { name: /^Inclus/ }).click();
  await dialog.getByLabel("Titre de la demande").fill("Page Équipe");
  await dialog.getByLabel("Source").selectOption("email");
  await dialog.getByLabel("Date de la demande").fill("2026-10-14");
  await dialog.getByLabel("Extrait").fill("Pouvez-vous ajouter une page Équipe avec nos 6 portraits ?");
  await dialog.getByLabel("Capture").setInputFiles({ name: "mail.png", mimeType: "image/png", buffer: png });
  await expect(dialog.getByRole("img", { name: "Aperçu de la capture" })).toBeVisible();
  await dialog.getByRole("button", { name: "Créer la demande" }).click();

  await expect.poll(async () => (await sql("select 1 from comments where organization_id = $1 and data->>'title' = 'Page Équipe'", [org])).length).toBe(1);
  const [{ id }] = await sql<{ id: string }>("select id from comments where organization_id = $1 and data->>'title' = 'Page Équipe'", [org]);
  const stored = await commentData(org, Number(id));
  expect(stored).toMatchObject({ decision: "Inclus", from: "agency", author: "Alice Martin", source: { channel: "email", receivedAt: "2026-10-14", excerpt: "Pouvez-vous ajouter une page Équipe avec nos 6 portraits ?" } });
  const capture = (stored.source as { capture: string }).capture;
  const [file] = await sql<{ path: string; mime_type: string }>("select path, mime_type from stored_files where organization_id = $1 and id = $2", [org, capture.split("/").at(-1)]);
  expect(file).toMatchObject({ mime_type: "image/png" });
  expect(file.path).toMatch(/^projets\/1\/livrables\/1\/demandes\/[0-9a-f]{64}\.png$/);

  // In the request's bubble (from the panel): where it came from, the words, the capture.
  await page.getByRole("tab", { name: /^Inclus/ }).click();
  await page.getByRole("button", { name: `Demande incluse #${id}` }).click();
  const source = page.getByRole("complementary", { name: "Source de la demande" }).first();
  await expect(source).toContainText("Demande reçue par e-mail le 14/10/2026, saisie par Alice Martin");
  await expect(source).toContainText("nos 6 portraits");
  await expect(source.getByRole("link", { name: "Ouvrir la capture" })).toHaveAttribute("href", capture);
  const [event] = await sql<{ description: string }>("select data->>'description' as description from audit_events where organization_id = $1 and type = 'scope.classified'", [org]);
  expect(event.description).toBe("Demande créée « Inclus » : Page Équipe (reçue par e-mail le 14/10/2026)");
  expect(errors).toEqual([]);
});

test("the client sees the source and its capture; the proof keeps them; a hidden request's capture stays closed", async () => {
  const { alice, org, token, linkKey, act } = await agency();
  const shown = await upload(alice, png, "appel.png", { kind: "request", projectId: 1, livrableId: 1 });
  const hidden = await upload(alice, Buffer.concat([png, Buffer.from("autre")]), "cache.png", { kind: "request", projectId: 1, livrableId: 1 });
  const included = await act(alice, { decision: "Inclus", title: "Logo plus grand", source: { channel: "call", excerpt: "Le logo est trop petit", capture: shown.json.href } });
  expect(included.status).toBe(200);
  // An out-of-scope request not quoted yet stays internal, with its capture.
  expect((await act(alice, { decision: "Hors périmètre", title: "Blog", source: { channel: "meeting", capture: hidden.json.href } })).status).toBe(200);

  const email = `${unique("claire")}@client.test`;
  await call("/api/review-access/invite", { person: alice, body: { linkKey, emails: [email] } });
  const client = await verifiedClient(token, email);
  const state = (await call(`/api/review/${token}`, { person: client })).json.state as { comments: { title?: string; source?: Record<string, unknown> }[] };
  expect(state.comments.find((comment) => comment.title === "Logo plus grand")?.source).toEqual({ channel: "call", excerpt: "Le logo est trop petit", capture: shown.json.href });
  expect(state.comments.some((comment) => comment.title === "Blog")).toBe(false);
  expect((await call(shown.json.href!, { person: client })).status).toBe(302);
  expect((await call(hidden.json.href!, { person: client })).status).toBe(404);

  const proof = (await call("/api/proof/1", { person: alice })).json as { requests: { title: string; source: { line: string; excerpt: string; captureSha256: string } | null }[] };
  const sha = (await sql<{ sha256: string }>("select sha256 from stored_files where organization_id = $1 and id = $2", [org, shown.json.href!.split("/").at(-1)]))[0].sha256;
  expect(proof.requests.find((request) => request.title === "Logo plus grand")?.source).toEqual({
    line: "Demande reçue par téléphone, saisie par Alice Martin",
    excerpt: "Le logo est trop petit",
    captureSha256: sha,
  });
});

test("sources are checked: known channel, real date, bounded words, an image the agency imported itself", async () => {
  const { alice, org, act } = await agency();
  for (const source of [{ channel: "fax" }, { channel: "constructor" }, { channel: "email", receivedAt: "14/10/2026" }, { channel: "email", excerpt: "x".repeat(5001) }, { channel: "email", capture: "https://evil.example/a.png" }, "e-mail"])
    expect((await act(alice, { decision: "Inclus", title: "Mal formée", source })).status, JSON.stringify(source).slice(0, 40)).toBe(400);

  const pdf = await upload(alice, makePdf("pas une image"), "doc.pdf", { kind: "request", projectId: 1, livrableId: 1 });
  expect((await act(alice, { decision: "Inclus", title: "PDF", source: { channel: "email", capture: pdf.json.href } })).status).toBe(404);
  const mallory: Member = await signUp("Mallory Autre");
  await createAgency(mallory, "Studio Intrus Sources");
  const foreign = await upload(mallory, png, "vol.png", { kind: "request", projectId: 1, livrableId: 1 });
  expect((await act(alice, { decision: "Inclus", title: "Volée", source: { channel: "email", capture: foreign.json.href } })).status).toBe(404);

  // « À clarifier »: a question still to discuss, from a call.
  const question = await act(alice, { decision: "À qualifier", title: "Quelle couleur pour le bouton ?", source: { channel: "call" } });
  expect(question.status).toBe(200);
  expect(await commentData(org, question.json.id as number)).toMatchObject({ decision: "À qualifier", kind: "remark", source: { channel: "call" } });
  expect(await sql("select 1 from comments where organization_id = $1 and data->>'title' in ('Mal formée', 'PDF', 'Volée')", [org])).toHaveLength(0);
});
