// Requests the agency enters from « + Demande » with their source (an e-mail, a call…), the client's
// words and a capture (src/lib/requestSource.ts): stored, checked by the server, shown to the client,
// and kept in the proof.

import { expect, test } from "@playwright/test";
import { call, createAgency, makePdf, newPerson, seedReview, seedState, signInPage, signUp, sql, unique, upload, verifiedClient, type Member, type Person } from "./helpers";

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

  await page.getByRole("button", { name: "Ajouter une demande" }).click();
  // Opened from the « À clarifier » tab: that choice comes first.
  await expect(page.getByRole("heading", { name: "Nouvelle demande" })).toBeVisible();
  const dialog = page;
  await expect(dialog.getByRole("radio", { name: /^À clarifier/ })).toBeChecked();
  await dialog.getByRole("radio", { name: /^Inclus/ }).click();
  await dialog.getByLabel("Titre de la demande").fill("Page Équipe");
  // Its source in a few gestures: the channel, the client's words, the day (today unless changed), a capture.
  // One line at the foot of the form; clicked, a section of its own, folded or taken away. « Autre » asks
  // for the channel's name.
  const channels = dialog.getByRole("radiogroup", { name: "Reçue par" });
  await expect(channels).toHaveCount(0);
  await dialog.getByRole("button", { name: "Ajouter une source" }).click();
  await channels.getByRole("radio", { name: "Autre" }).click();
  await expect(dialog.getByLabel("Précisez le canal")).toBeVisible();
  await channels.getByRole("radio", { name: "E-mail" }).click();
  await expect(dialog.getByLabel("Précisez le canal")).toHaveCount(0);
  // Folded: its channel said in its title; unfolded again to go on.
  await dialog.getByRole("button", { name: /^Source/ }).click();
  await expect(channels).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: /^Source/ })).toContainText("E-mail");
  await dialog.getByRole("button", { name: /^Source/ }).click();
  await expect(dialog.getByLabel("Date de la demande")).not.toHaveValue("");
  await dialog.getByLabel("Date de la demande").fill("2026-10-14");
  await dialog.getByLabel("Message du client").fill("Pouvez-vous ajouter une page Équipe avec nos 6 portraits ?");
  await dialog.getByLabel("Capture", { exact: true }).setInputFiles({ name: "mail.png", mimeType: "image/png", buffer: png });
  await expect(dialog.getByRole("img", { name: "Aperçu de la capture" })).toBeVisible();
  await dialog.getByRole("button", { name: "Créer la demande" }).click();

  // (The capture is uploaded first: it takes longer on a loaded machine.)
  await expect.poll(async () => (await sql("select 1 from comments where organization_id = $1 and data->>'title' = 'Page Équipe'", [org])).length, { timeout: 30_000 }).toBe(1);
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
  // Its own tab, beside « Détail » and « Discussion ».
  const bubble = page.getByRole("dialog", { name: new RegExp(`#${id}$`) });
  await expect(bubble.getByRole("complementary", { name: "Source de la demande" })).toHaveCount(0);
  await bubble.getByRole("tab", { name: "Source" }).click();
  const source = bubble.getByRole("complementary", { name: "Source de la demande" });
  await expect(source).toContainText("Demande reçue par e-mail le 14/10/2026, saisie par Alice Martin");
  // The client's words as a message, no title over them; the capture under its title, the image itself the
  // bubble's width, never a box around it.
  await expect(source.getByRole("heading")).toHaveText(["Message", "Capture"]);
  await expect(source.getByRole("region", { name: "Message" })).toContainText("nos 6 portraits");
  const shot = source.getByRole("img", { name: "Capture jointe à la demande" });
  await expect(shot).toHaveJSProperty("complete", true);
  const [shotBox, sourceBox] = [await shot.boundingBox(), await source.boundingBox()];
  expect(shotBox!.width).toBeGreaterThan(sourceBox!.width - 40);
  // The tabs: a tab with the keyboard's focus is underlined, never boxed.
  await bubble.getByRole("tab", { name: "Détail" }).focus();
  await page.keyboard.press("End");
  const tab = bubble.getByRole("tab", { name: "Source" });
  await expect(tab).toBeFocused();
  // No frame on any side, whatever its state; the active tab keeps its underline under the keyboard too.
  for (const side of ["top", "right", "bottom", "left"]) await expect(tab).toHaveCSS(`border-${side}-width`, "0px");
  await expect(tab).toHaveCSS("outline-style", "none");
  // Its underline a bar under its label, never a shadow (a shadow bled on its sides at some screen scales).
  const underline = () => tab.evaluate((el) => { const bar = getComputedStyle(el, "::after"); return [getComputedStyle(el).boxShadow, bar.height, bar.backgroundColor, bar.opacity]; });
  expect(await underline()).toEqual(["none", "2px", "rgb(17, 17, 17)", "1"]);
  await tab.click();
  for (const side of ["left", "right"]) await expect(tab).toHaveCSS(`border-${side}-width`, "0px");
  expect(await underline()).toEqual(["none", "2px", "rgb(17, 17, 17)", "1"]);
  await expect(source.getByRole("link", { name: "Ouvrir la capture" })).toHaveAttribute("href", capture);
  const [event] = await sql<{ description: string }>("select data->>'description' as description from audit_events where organization_id = $1 and type = 'scope.classified'", [org]);
  expect(event.description).toBe("Demande créée « Inclus » : Page Équipe (reçue par e-mail le 14/10/2026)");
  expect(errors).toEqual([]);
});

test("qualifying its own pin, the agency says where the request came from; a quote's delay in weeks; no blue on a field being typed in", async ({ browser }) => {
  const { alice, org } = await agency();
  const pin = await call("/api/comments", { method: "POST", person: alice, body: { deliverableId: 1, message: "Vu au téléphone", page: 1, position: { x: 30, y: 30 } } });
  const id = Number(pin.json.id);
  const { page, errors } = await newPerson(browser);
  await signInPage(page, alice.email);
  await page.goto("/projets/1/livrables/1");
  await page.locator(`[data-pin="${id}"]`).click();
  await page.getByRole("button", { name: "Qualifier", exact: true }).click();
  const bubble = page.getByRole("dialog", { name: new RegExp(`#${id}$`) });
  await bubble.getByRole("radio", { name: /Hors scope/ }).click();
  await bubble.getByLabel("Titre de la demande").fill("Page Équipe");
  // A field being typed in: a dark border, no outline, never the action blue.
  const title = bubble.getByLabel("Titre de la demande");
  await expect(title).toBeFocused();
  expect(await title.evaluate((field) => [getComputedStyle(field).outlineStyle, getComputedStyle(field).borderColor])).toEqual(["none", "rgb(76, 76, 72)"]);
  // Its source, as in « + Demande »: at the foot of the form.
  await bubble.getByRole("button", { name: "Ajouter une source" }).click();
  await bubble.getByRole("radiogroup", { name: "Reçue par" }).getByRole("radio", { name: "Appel" }).click();
  await bubble.getByLabel("Date de la demande").fill("2026-10-20");
  await bubble.getByLabel("Message du client").fill("Une page Équipe avec nos portraits.");
  await bubble.getByLabel("Capture", { exact: true }).setInputFiles({ name: "appel.png", mimeType: "image/png", buffer: png });
  // A quote: its amount with a comma, its delay in weeks.
  await bubble.getByRole("switch", { name: /Préparer la proposition/ }).click();
  await bubble.getByLabel("Montant HT").fill("1 200,50");
  await bubble.getByLabel("Délai", { exact: true }).fill("2");
  await bubble.getByRole("combobox", { name: "Unité du délai" }).click();
  await page.getByRole("option", { name: "semaines" }).click();
  await bubble.getByRole("button", { name: "Créer la demande" }).click();

  await expect.poll(async () => (await commentData(org, id))?.source, { timeout: 30_000 }).toMatchObject({ channel: "call", receivedAt: "2026-10-20", excerpt: "Une page Équipe avec nos portraits." });
  expect(((await commentData(org, id)).source as { capture?: string }).capture).toMatch(/^\/api\/files\//);
  const [draft] = await sql<{ data: { amount: number; deadline: number } }>("select data from proposal_versions where organization_id = $1 and comment_id = $2", [org, id]);
  expect(draft.data).toMatchObject({ amount: 1200.5, deadline: 14 });
  const [event] = await sql<{ description: string }>("select data->>'description' as description from audit_events where organization_id = $1 and type = 'scope.classified'", [org]);
  expect(event.description).toBe("Demande qualifiée « Hors scope » : Page Équipe (reçue par téléphone le 20/10/2026)");
  expect(errors).toEqual([]);

  // A client's words are never the agency's to source: refused by the server, the form not offering it either.
  await seedState(alice, {
    lists: { comments: { upsert: [{ id: 30, deliverableId: 1, author: "Claire Dubois", initials: "CD", from: "client", kind: "remark", message: "Logo trop petit", decision: "À qualifier", location: "", time: "t" }], remove: [] } },
  });
  const refused = await call("/api/comments/30/qualification", { method: "PUT", person: alice, body: { decision: "Inclus", title: "Logo", source: { channel: "email" } } });
  expect(refused.status).toBe(409);
  // Nor is it the agency's to take away.
  expect((await call("/api/comments/30/qualification", { method: "PUT", person: alice, body: { decision: "Inclus", title: "Logo", removeSource: true } })).status).toBe(409);
  expect((await commentData(org, 30)).source).toBeUndefined();
});

test("« Modifier » a request the agency entered: its source in the form as entered, changed, or taken away", async ({ browser }) => {
  const { alice, org, act } = await agency();
  const shot = await upload(alice, png, "appel.png", { kind: "request", projectId: 1, livrableId: 1 });
  const made = await act(alice, { decision: "Inclus", title: "Page Équipe", source: { channel: "call", receivedAt: "2026-10-14", excerpt: "Une page Équipe", capture: shot.json.href } });
  const id = made.json.id as number;
  const { page, errors } = await newPerson(browser);
  await signInPage(page, alice.email);
  await page.goto("/projets/1/livrables/1");
  await page.getByRole("tab", { name: /^Inclus/ }).click();
  await page.getByRole("button", { name: `Demande incluse #${id}` }).click();
  const bubble = page.getByRole("dialog", { name: new RegExp(`#${id}$`) });
  await bubble.getByRole("button", { name: "Modifier" }).click();

  // As entered: its channel, its day, the client's words, its capture.
  const channels = bubble.getByRole("radiogroup", { name: "Reçue par" });
  await expect(channels.getByRole("radio", { name: "Appel" })).toHaveAttribute("aria-checked", "true");
  await expect(bubble.getByLabel("Date de la demande")).toHaveValue("2026-10-14");
  await expect(bubble.getByLabel("Message du client")).toHaveValue("Une page Équipe");
  await expect(bubble.getByRole("img", { name: "Aperçu de la capture" })).toBeVisible();

  // Changed: by e-mail, the capture kept.
  await channels.getByRole("radio", { name: "E-mail" }).click();
  await bubble.getByRole("button", { name: "Enregistrer" }).click();
  await expect.poll(async () => (await commentData(org, id))?.source).toEqual({ channel: "email", receivedAt: "2026-10-14", excerpt: "Une page Équipe", capture: shot.json.href });

  // Taken away.
  await bubble.getByRole("button", { name: "Modifier" }).click();
  await bubble.getByRole("button", { name: "Retirer la source" }).click();
  await bubble.getByRole("button", { name: "Enregistrer" }).click();
  await expect.poll(async () => (await commentData(org, id))?.source).toBeUndefined();
  expect(errors).toEqual([]);
});

test("the client sees the source and its capture; the proof keeps them; a hidden request's capture stays closed", async () => {
  const { alice, org, token, linkKey, act } = await agency();
  // Another deliverable of the project, shared with no one: its requests stay hidden from this client.
  await seedState(alice, { lists: { deliverables: { upsert: [{ id: 2, projectId: 1, name: "autre.png", type: "Image", version: 1, status: "Brouillon", locked: false, importedAt: "14/10/2026" }], remove: [] } } });
  const shown = await upload(alice, png, "appel.png", { kind: "request", projectId: 1, livrableId: 1 });
  const hidden = await upload(alice, Buffer.concat([png, Buffer.from("autre")]), "cache.png", { kind: "request", projectId: 1, livrableId: 1 });
  const included = await act(alice, { decision: "Inclus", title: "Logo plus grand", source: { channel: "call", excerpt: "Le logo est trop petit", capture: shown.json.href } });
  expect(included.status).toBe(200);
  // A request on the deliverable not shared, with its capture.
  expect((await act(alice, { deliverableId: 2, decision: "Hors périmètre", title: "Blog", source: { channel: "meeting", capture: hidden.json.href } })).status).toBe(200);

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
  for (const source of [{ channel: "fax" }, { channel: "constructor" }, { channel: "email", receivedAt: "14/10/2026" }, { channel: "email", excerpt: "x".repeat(5001) }, { channel: "email", capture: "https://evil.example/a.png" }, { channel: "email", channelName: "WhatsApp" }, { channel: "other", channelName: "x".repeat(41) }, "e-mail"])
    expect((await act(alice, { decision: "Inclus", title: "Mal formée", source })).status, JSON.stringify(source).slice(0, 40)).toBe(400);

  const pdf = await upload(alice, makePdf("pas une image"), "doc.pdf", { kind: "request", projectId: 1, livrableId: 1 });
  expect((await act(alice, { decision: "Inclus", title: "PDF", source: { channel: "email", capture: pdf.json.href } })).status).toBe(404);
  const mallory: Member = await signUp("Mallory Autre");
  await createAgency(mallory, "Studio Intrus Sources");
  const foreign = await upload(mallory, png, "vol.png", { kind: "request", projectId: 1, livrableId: 1 });
  expect((await act(alice, { decision: "Inclus", title: "Volée", source: { channel: "email", capture: foreign.json.href } })).status).toBe(404);

  // « Autre »: its channel named, and read so.
  const named = await act(alice, { decision: "Inclus", title: "Vu sur WhatsApp", source: { channel: "other", channelName: " WhatsApp " } });
  expect(named.status).toBe(200);
  expect(await commentData(org, named.json.id as number)).toMatchObject({ source: { channel: "other", channelName: "WhatsApp" } });
  const [event] = await sql<{ description: string }>("select data->>'description' as description from audit_events where organization_id = $1 and type = 'scope.classified' and data->>'description' like '%WhatsApp%'", [org]);
  expect(event.description).toBe("Demande créée « Inclus » : Vu sur WhatsApp (reçue par WhatsApp)");

  // « À clarifier »: a question still to discuss, from a call.
  const question = await act(alice, { decision: "À qualifier", title: "Quelle couleur pour le bouton ?", source: { channel: "call" } });
  expect(question.status).toBe(200);
  expect(await commentData(org, question.json.id as number)).toMatchObject({ decision: "À qualifier", kind: "remark", source: { channel: "call" } });
  expect(await sql("select 1 from comments where organization_id = $1 and data->>'title' in ('Mal formée', 'PDF', 'Volée')", [org])).toHaveLength(0);
});

test("each request's card shows where it came from, at a glance: a brand's logo, a Kora glyph, or Kora's mark when made in Kora", async ({ browser }) => {
  const { alice, org, act } = await agency();
  const made = async (title: string, channel?: string) => {
    const answer = await act(alice, { decision: "À qualifier", title, ...(channel ? { source: { channel, receivedAt: "2026-10-20" } } : {}) });
    expect(answer.status).toBe(200);
    return answer.json.id as number;
  };
  const byMail = await made("Ajouter un blog", "email");
  const byTeams = await made("Changer le logo", "teams");
  const bySlack = await made("Revoir le menu", "slack");
  const inKora = await made("Question sur la police");
  expect((await call(`/api/comments/${byMail}/replies`, { method: "POST", person: alice, body: { message: "Je regarde." } })).status).toBe(200);
  // Teams is a source like the others, and the server says so in the proof's words.
  expect((await commentData(org, byTeams)).source).toEqual({ channel: "teams", receivedAt: "2026-10-20" });

  const { page, errors } = await newPerson(browser);
  await signInPage(page, alice.email);
  await page.goto("/projets/1/livrables/1");
  const card = (id: number) => page.getByRole("button", { name: new RegExp(`#${id}$`) });
  await expect(card(byMail)).toBeVisible();
  // The source is read after the card's name, and told on hover; the name itself is unchanged.
  await expect(card(byMail)).toHaveAccessibleDescription("Demande reçue par e-mail le 20/10/2026");
  await card(byMail).locator(".thread-row-source").hover();
  await expect(page.getByRole("tooltip")).toHaveText("Demande reçue par e-mail le 20/10/2026");
  await expect(card(byMail).locator(".source-icon-email")).toBeVisible();
  // Kora's own marks are neutral: a status colour says a status only (DESIGN.md).
  await expect(card(byMail).locator(".source-icon-email")).toHaveCSS("background-color", "rgb(236, 236, 232)");
  await expect(card(byMail).locator(".source-icon-email")).toHaveCSS("color", "rgb(76, 76, 72)");
  // The channel's mark at the end of the name's line, its words on hover; its messages under the name.
  await expect(card(byMail).locator(".thread-row-meta .thread-row-source .source-icon-email")).toBeVisible();
  const [meta, mark] = [await card(byMail).locator(".thread-row-meta").boundingBox(), await card(byMail).locator(".thread-row-source").boundingBox()];
  expect(Math.round(mark!.x + mark!.width)).toBe(Math.round(meta!.x + meta!.width));
  const [name, messages] = [await card(byMail).locator(".thread-row-meta").boundingBox(), await card(byMail).locator(".thread-row-replies").boundingBox()];
  expect(messages!.y).toBeGreaterThanOrEqual(name!.y + name!.height);
  // Its icon, then its words, as in a pin's hover preview (feedback of 26 October 2026).
  await expect(card(byMail).locator(".thread-row-replies")).toHaveText("1 réponse");
  await expect(card(byMail).locator(".thread-row-replies svg")).toHaveCount(1);
  // Each opens its own tab of the bubble: the messages « Discussion », the source « Source ».
  const bubble = page.getByRole("dialog", { name: new RegExp(`#${byMail}$`) });
  await card(byMail).locator(".thread-row-replies").click();
  await expect(bubble.getByRole("tab", { name: "Discussion" })).toHaveAttribute("aria-selected", "true");
  await expect(bubble.getByText("Je regarde.")).toBeVisible();
  await card(byMail).locator(".thread-row-source").click();
  await expect(bubble.getByRole("tab", { name: "Source" })).toHaveAttribute("aria-selected", "true");
  await expect(bubble.getByRole("complementary", { name: "Source de la demande" })).toContainText("Demande reçue par e-mail le 20/10/2026");
  await expect(card(byTeams)).toHaveAccessibleDescription("Demande reçue sur Teams le 20/10/2026");
  await expect(card(byTeams).locator(".thread-row-source svg linearGradient")).toHaveCount(1);
  await expect(card(bySlack).locator(".thread-row-source svg path")).toHaveCount(4);
  // Made in Kora (entered without a source, as a pin on the deliverable): no mark, nothing more read.
  await expect(card(inKora)).toBeVisible();
  await expect(card(inKora).locator(".thread-row-source")).toHaveCount(0);
  await expect(card(inKora)).toHaveAccessibleDescription("");
  // Teams is offered in « + Demande ».
  await page.getByRole("button", { name: "Ajouter une demande" }).click();
  await page.getByRole("button", { name: "Ajouter une source" }).click();
  await expect(page.getByRole("radiogroup", { name: "Reçue par" }).getByRole("radio", { name: "Teams" })).toHaveCount(1);
  // Taken away: no source, the line back.
  await page.getByRole("button", { name: "Retirer la source" }).click();
  await expect(page.getByRole("radiogroup", { name: "Reçue par" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Ajouter une source" })).toBeVisible();
  expect(errors).toEqual([]);
});
