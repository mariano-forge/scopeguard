// A project's reference scope (US-045): the « Périmètre » tab of a project, written by the agency from its
// signed quote or the client's brief, then activated as the reference; and what the server accepts of it.

import { expect, test } from "@playwright/test";
import { call, createAgency, makePdf, newPerson, seedReview, seedState, signInPage, signUp, sql, unique, upload, verifiedClient, type Member } from "./helpers";

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

async function agencyWithProject() {
  const alice = await signUp("Alice Martin");
  await createAgency(alice, "Studio Périmètre");
  await seedState(alice, {
    lists: {
      clients: { upsert: [{ id: 1, name: "Northwind" }], remove: [] },
      projects: { upsert: [{ id: 1, name: "Refonte", clientId: 1, client: "Northwind", status: "En cours" }], remove: [] },
    },
  });
  return { alice, org: alice.organizationId! };
}

const scopeOf = async (org: string) =>
  (await sql<{ data: { scope?: Record<string, unknown> } }>("select data from projects where organization_id = $1 and id = 1", [org]))[0]?.data.scope;
const saveScope = (member: Member, scope: unknown, projectId = 1) => call(`/api/projects/${projectId}/scope`, { method: "PUT", person: member, body: { scope } });

test("the agency frames a project from its quote: the PDF to read, imported or dropped, and the scope's sections", async ({ browser }) => {
  const { alice, org } = await agencyWithProject();
  const { page, errors } = await newPerson(browser);
  await signInPage(page, alice.email);
  await page.goto("/projets/1");

  // The project's two sections; its scope still to frame.
  const sections = page.getByRole("navigation", { name: "Sections du projet" });
  await expect(sections.getByRole("link", { name: /Livrables/ })).toHaveAttribute("aria-current", "page");
  await sections.getByRole("link", { name: /Périmètre/ }).click();
  await expect(page).toHaveURL(/\/projets\/1\/perimetre$/);
  // The tab names the section, without a state: the scope's header says it.
  await expect(sections.getByRole("link", { name: /Périmètre/ })).toHaveText("Périmètre");

  // Two ways in, either one: the AI reads a document (faster), or the agency types it. The signed quote first.
  await expect(page.getByRole("region", { name: "Saisir à la main" }).getByRole("button", { name: "Commencer la saisie" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Extraire avec l’IA" }).getByRole("button", { name: "Coller un texte" })).toBeVisible();
  await page.getByLabel("Document de référence").setInputFiles({ name: "devis-signe.pdf", mimeType: "application/pdf", buffer: makePdf("Devis") });
  const intake = page.getByRole("region", { name: "Extraire avec l’IA" });
  await expect(intake).toContainText("devis-signe.pdf");
  // A PDF dropped on the zone takes its place, as « Modifier » would.
  await expect(intake.getByRole("button", { name: "Modifier le PDF à lire (devis-signe.pdf)" })).toBeVisible();
  const bytes = [...makePdf("Cahier")];
  const dropped = await page.evaluateHandle((content) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([new Uint8Array(content)], "cahier-des-charges.pdf", { type: "application/pdf" }));
    return transfer;
  }, bytes);
  const zone = intake.locator(".scope-dropzone");
  await zone.dispatchEvent("dragover", { dataTransfer: dropped });
  await expect(zone).toHaveClass(/is-over/);
  await zone.dispatchEvent("drop", { dataTransfer: dropped });
  await expect(intake).toContainText("cahier-des-charges.pdf");
  await expect(intake).not.toContainText("devis-signe.pdf");
  // An empty section says what to put in it.
  await expect(page.getByRole("region", { name: "Non inclus", exact: true })).toContainText("Ce que le devis exclut");
  // Its sections, and nothing else: the AI's reading, what is included, what is not, the amendments.
  expect((await page.locator(".scope-card h2").allInnerTexts()).map((title) => title.replace(/\s+/g, " ").trim())).toEqual(["Extraire avec l’IA", "Inclus 0", "Non inclus 0", "Avenants 0"]);

  // Saved: the PDF to read, in the project's scope folder; still a draft.
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect.poll(() => scopeOf(org)).toMatchObject({ sources: [{ kind: "brief", name: "cahier-des-charges.pdf" }] });
  expect((await scopeOf(org))!.activatedAt).toBeUndefined();
  const [file] = await sql<{ path: string; mime_type: string }>("select path, mime_type from stored_files where organization_id = $1", [org]);
  expect(file).toMatchObject({ mime_type: "application/pdf", path: expect.stringMatching(/^projets\/1\/perimetre\//) });
  // Nothing included yet: the draft says what to do before it can be activated.
  await expect(page.getByRole("status").filter({ hasText: "Brouillon · Remplissez ce qui est inclus, puis activez-le" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("the agency types what is included and not, then activates it as the reference, changes it, and takes it back", async ({ browser }) => {
  const { alice, org } = await agencyWithProject();
  const { page, errors } = await newPerson(browser);
  await signInPage(page, alice.email);
  await page.goto("/projets/1/perimetre");
  await page.getByRole("region", { name: "Saisir à la main" }).getByRole("button", { name: "Commencer la saisie" }).click();
  await expect(page.getByLabel("Désignation de la ligne 1")).toBeFocused();

  // One line per item, typed as in a spreadsheet: Enter goes to a new line, its title ready; a line duplicates.
  await page.getByLabel("Désignation de la ligne 1").fill("Pages intérieures");
  await page.getByLabel("Quantité de la ligne 1").fill("5");
  await page.getByLabel("Unité de la ligne 1").click();
  await page.getByRole("option", { name: "pages", exact: true }).click();
  await page.getByLabel("Quantité de la ligne 1").press("Enter");
  await expect(page.getByLabel("Désignation de la ligne 2")).toBeFocused();
  await page.keyboard.type("Formulaire de contact");
  await page.getByRole("button", { name: "Dupliquer la ligne 1" }).click();
  await expect(page.getByLabel("Désignation de la ligne 2")).toHaveValue("Pages intérieures");
  await expect(page.getByLabel("Quantité de la ligne 2")).toHaveValue("5");
  await page.getByLabel("Désignation de la ligne 2").fill("Page d’accueil");
  await page.getByLabel("Quantité de la ligne 2").fill("1");
  await page.getByLabel("Unité de la ligne 2").click();
  await page.getByRole("option", { name: "Aucune" }).click();

  // What is not included.
  await page.getByRole("button", { name: "Ajouter une exclusion" }).click();
  await page.getByLabel("Désignation de l’exclusion 1", { exact: true }).fill("Rédaction des textes");

  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect.poll(() => scopeOf(org)).toMatchObject({
    lines: [
      { title: "Pages intérieures", quantity: 5, unit: "pages" },
      { title: "Page d’accueil", quantity: 1 },
      { title: "Formulaire de contact" },
    ],
    exclusions: [{ title: "Rédaction des textes" }],
  });
  expect((await scopeOf(org))!.activatedAt).toBeUndefined();
  // Filled in: only its activation is left to recommend.
  await expect(page.getByRole("status").filter({ hasText: "Brouillon · Activez-le pour qu’il serve de référence à chaque demande du client." })).toBeVisible();

  // Activated: the reference, signed by the server, in the journal; then read.
  await page.getByRole("button", { name: "Activer le périmètre" }).click();
  await expect.poll(async () => (await scopeOf(org))?.activatedBy).toBe("Alice Martin");
  await expect(page.getByRole("status").filter({ hasText: /Actif · activé par Alice Martin le/ })).toBeVisible();
  expect((await sql("select 1 from audit_events where organization_id = $1 and type = 'project.scope.activated'", [org])).length).toBe(1);
  const included = page.getByRole("region", { name: "Inclus", exact: true });
  await expect(included).toContainText("Pages intérieures");
  await expect(included).toContainText("5 pages");

  // Changed afterwards with « Modifier »: still the reference, as activated.
  await page.getByRole("button", { name: "Modifier" }).click();
  await page.getByLabel("Quantité de la ligne 1").fill("6");
  await page.getByRole("button", { name: "Annuler" }).click();
  await expect(included).toContainText("5 pages");
  await page.getByRole("button", { name: "Modifier" }).click();
  await page.getByLabel("Quantité de la ligne 1").fill("6");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect.poll(async () => ((await scopeOf(org))?.lines as { quantity?: number }[])[0].quantity).toBe(6);
  await expect(included).toContainText("6 pages");
  expect((await scopeOf(org))!.activatedBy).toBe("Alice Martin");

  // No longer the reference: back to a draft, in the journal too.
  await page.getByRole("button", { name: "Plus d’actions sur le périmètre" }).click();
  await page.getByRole("menuitem", { name: "Repasser en brouillon" }).click();
  await expect.poll(async () => (await scopeOf(org))?.activatedAt).toBeUndefined();
  await expect(page.getByRole("status").filter({ hasText: "Brouillon" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Activer le périmètre" })).toBeVisible();
  expect((await scopeOf(org))!.lines).toHaveLength(3);
  expect((await sql("select 1 from audit_events where organization_id = $1 and type = 'project.scope.deactivated'", [org])).length).toBe(1);

  // Scrolled down a short window, its status and actions stay in sight, under Kora's tab bar.
  await page.setViewportSize({ width: 1228, height: 600 });
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(200);
  const [tabBar, status] = [(await page.locator(".tab-bar").boundingBox())!, (await page.locator(".scope-status").boundingBox())!];
  expect(status.y).toBeGreaterThanOrEqual(tabBar.y + tabBar.height);
  await expect(page.getByRole("button", { name: "Activer le périmètre" })).toBeInViewport();
  expect(errors).toEqual([]);
});

test("an accepted out-of-scope quote is an amendment of the scope, and an open deliverable shows what was agreed", async ({ browser }) => {
  const { alice } = await agencyWithProject();
  await seedState(alice, {
    lists: {
      deliverables: { upsert: [{ id: 1, projectId: 1, name: "maquette.png", type: "Image", version: 1, status: "En attente client", locked: false, importedAt: "23/10/2026 10:00" }], remove: [] },
      comments: {
        upsert: [{ id: 40, deliverableId: 1, author: "Alice Martin", initials: "AM", from: "agency", kind: "request", message: "Une page Équipe", title: "Page Équipe", decision: "Hors périmètre", location: "", time: "t" }],
        remove: [],
      },
    },
    maps: {
      proposalStates: { upsert: { "40": "sent" }, remove: [] },
      proposalVersions: { upsert: { "40": [{ id: 400, commentId: 40, version: 1, amount: 600, deadline: 3, status: "accepted", createdAt: "x", description: "Page Équipe" }] }, remove: [] },
      proposalDecisions: { upsert: { "40": "accepted" }, remove: [] },
    },
  });
  expect((await saveScope(alice, { lines: [{ id: 1, title: "Pages intérieures", quantity: 5, unit: "pages" }], budget: 12000 })).status).toBe(200);
  expect((await call("/api/projects/1/scope/activation", { method: "POST", person: alice })).status).toBe(200);
  const { page, errors } = await newPerson(browser);
  await signInPage(page, alice.email);

  // In the scope: the amendment, its amount, the request it comes from.
  await page.goto("/projets/1/perimetre");
  await expect(page.getByText("+600 €").first()).toBeVisible();
  const amendments = page.getByRole("region", { name: "Avenants" });
  const amendment = amendments.getByRole("link", { name: "Page Équipe" });
  await expect(amendment).toHaveAttribute("href", "/projets/1/livrables/1/versions/1?demande=40");
  await expect(amendments).toContainText("+600 € · +3 j");

  // From the open deliverable, what was agreed, without leaving it.
  await page.goto("/projets/1/livrables/1");
  // A breadcrumb back to its project, and only there, on one line with the deliverable's name.
  const crumb = page.getByRole("navigation", { name: "Fil d’Ariane" });
  await expect(crumb.getByRole("link")).toHaveCount(1);
  await expect(crumb.getByRole("link", { name: "Refonte" })).toHaveAttribute("href", "/projets/1");
  const [back, name] = [(await crumb.getByRole("link", { name: "Refonte" }).boundingBox())!, (await crumb.getByRole("button", { name: "Actions du livrable maquette.png" }).boundingBox())!];
  expect(Math.abs(back.y + back.height / 2 - (name.y + name.height / 2))).toBeLessThan(2);
  expect(back.x + back.width).toBeLessThan(name.x);
  await page.getByRole("complementary", { name: "Demandes" }).getByRole("button", { name: "Périmètre du projet" }).click();
  const dialog = page.getByRole("dialog", { name: "Périmètre du projet" });
  await expect(dialog).toContainText("Activé par Alice Martin");
  await expect(dialog.getByRole("region", { name: "Inclus", exact: true })).toContainText("Pages intérieures");
  await expect(dialog.getByRole("region", { name: "Avenants" })).toContainText("+600 € · +3 j");
  await expect(dialog.getByRole("link", { name: "Ouvrir le périmètre" })).toHaveAttribute("href", "/projets/1/perimetre");
  expect(errors).toEqual([]);
});

test("a project's deliverables recommend completing and activating its scope, until it is active", async ({ browser }) => {
  const { alice } = await agencyWithProject();
  const { page, errors } = await newPerson(browser);
  await signInPage(page, alice.email);
  const advice = page.getByRole("note", { name: "Recommandation sur le périmètre" });

  // No scope yet: to complete, then activate, from its tab.
  await page.goto("/projets/1");
  await expect(advice).toContainText("Recommandé : complétez et activez le périmètre du projet");
  await expect(advice).toContainText("ce qui dépasse le devis devient un avenant chiffré");
  await advice.getByRole("link", { name: "Compléter le périmètre" }).click();
  await expect(page).toHaveURL(/\/projets\/1\/perimetre$/);
  // Only on the deliverables: not on the scope it leads to.
  await expect(advice).toHaveCount(0);

  // A draft with what is included: only its activation is left.
  expect((await saveScope(alice, { lines: [{ id: 1, title: "Pages intérieures", quantity: 5 }] })).status).toBe(200);
  await page.goto("/projets/1");
  await expect(advice).toContainText("Recommandé : activez le périmètre du projet");
  await expect(advice.getByRole("link", { name: "Finaliser le périmètre" })).toHaveAttribute("href", "/projets/1/perimetre");

  // Active: nothing left to recommend.
  expect((await call("/api/projects/1/scope/activation", { method: "POST", person: alice })).status).toBe(200);
  await page.goto("/projets/1");
  await expect(page.getByRole("navigation", { name: "Sections du projet" }).getByRole("link", { name: /Livrables/ })).toHaveAttribute("aria-current", "page");
  await expect(page.getByText("Aucun livrable")).toBeVisible();
  await expect(advice).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("« Extraire avec l’IA »: a pasted text or a PDF read into items, reviewed one by one, then added to the draft", async ({ browser }) => {
  const { alice, org } = await agencyWithProject();
  const { page, errors } = await newPerson(browser);
  await signInPage(page, alice.email);
  await page.goto("/projets/1/perimetre");
  await page.getByRole("region", { name: "Extraire avec l’IA" }).getByRole("button", { name: "Coller un texte" }).click();

  // A text: one item a line, those after « Non inclus » excluded (the tests' engine, src/lib/scopeExtractor.ts).
  const intake = page.getByRole("region", { name: "Extraire avec l’IA" });
  await intake.getByLabel("Texte du devis ou du cahier des charges").fill("Pages intérieures — 5 pages\nFormulaire de contact\nNon inclus :\nRédaction des textes\nPhotos");
  await intake.getByRole("button", { name: "Lancer l’extraction" }).click();
  const proposed = intake.getByRole("group", { name: "Éléments proposés" });
  await expect(proposed.getByRole("listitem")).toHaveCount(4);
  // Reviewed: one set aside, one moved to « Non inclus »; only what is kept is added.
  await proposed.getByRole("checkbox", { name: "Garder « Photos »" }).click();
  await proposed.getByRole("combobox", { name: "Inclus ou non : « Formulaire de contact »" }).click();
  await page.getByRole("option", { name: "Non inclus" }).click();
  await proposed.getByRole("button", { name: "Ajouter 3 éléments au périmètre" }).click();
  await expect(page.getByLabel("Désignation de la ligne 1")).toHaveValue("Pages intérieures");
  await expect(page.getByLabel("Quantité de la ligne 1")).toHaveValue("5");
  await expect(page.getByLabel("Unité de la ligne 1")).toContainText("pages");
  await expect(page.getByLabel("Désignation de la ligne 2")).toHaveCount(0);
  // In the order proposed.
  await expect(page.getByLabel("Désignation de l’exclusion 1", { exact: true })).toHaveValue("Formulaire de contact");
  await expect(page.getByLabel("Désignation de l’exclusion 2", { exact: true })).toHaveValue("Rédaction des textes");
  // A proposal until saved: nothing is written by the extraction itself.
  expect(await scopeOf(org)).toBeUndefined();
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect.poll(() => scopeOf(org)).toMatchObject({
    lines: [{ title: "Pages intérieures", quantity: 5, unit: "pages" }],
    exclusions: [{ title: "Formulaire de contact" }, { title: "Rédaction des textes" }],
  });

  // A PDF: imported into the reference documents, then read.
  await intake.getByRole("tab", { name: "Un PDF" }).click();
  await page.getByLabel("Document de référence").setInputFiles({ name: "devis-signe.pdf", mimeType: "application/pdf", buffer: makePdf("Devis") });
  await expect(intake).toContainText("devis-signe.pdf");
  await intake.getByRole("button", { name: "Lancer l’extraction" }).click();
  // Read as a model gets it: the words of the PDF, read by the server.
  await expect(intake.getByRole("group", { name: "Éléments proposés" })).toContainText("Devis - page 1");
  await intake.getByRole("button", { name: "Ignorer" }).click();
  // The PDF taken away: the zone is free again; the draft is back to what is saved (no document), nothing to save.
  await intake.getByRole("button", { name: "Retirer le PDF à lire (devis-signe.pdf)" }).click();
  await expect(intake).toContainText("Glissez le devis ou le cahier des charges ici");
  await expect(page.getByRole("button", { name: "Enregistrer" })).toHaveCount(0);
  expect((await scopeOf(org))?.sources).toEqual([]);
  expect(errors).toEqual([]);
});

test("the extraction reads only what the agency may: a text or one of its own PDFs, on one of its projects", async () => {
  const { alice } = await agencyWithProject();
  const extract = (person: Member | undefined, body: unknown, projectId = 1) => call(`/api/projects/${projectId}/scope/extraction`, { method: "POST", person, body });

  // Signed in; a text or a file, not both, not neither, not too long; one of its projects.
  expect((await extract(undefined, { text: "Logo" })).status).toBe(401);
  expect((await extract(alice, {})).status).toBe(400);
  expect((await extract(alice, { text: "Logo", file: "/api/files/00000000-0000-0000-0000-000000000000" })).status).toBe(400);
  expect((await extract(alice, { text: "x".repeat(50_001) })).status).toBe(400);
  expect((await extract(alice, { text: "Logo" }, 99)).status).toBe(404);

  // Its own PDFs only: not another agency's, not an image of its own.
  const stranger = await signUp("Sam Dehors");
  await createAgency(stranger, "Autre Studio");
  const foreign = (await upload(stranger, makePdf("Ailleurs"), "ailleurs.pdf", { kind: "scope", projectId: 1 })).json.href!;
  expect((await extract(alice, { file: foreign })).status).toBe(404);
  const image = (await upload(alice, png, "capture.png", { kind: "scope", projectId: 1 })).json.href!;
  expect((await extract(alice, { file: image })).status).toBe(404);

  // What it may read, read: a proposal, nothing written.
  const own = (await upload(alice, makePdf("Devis"), "devis.pdf", { kind: "scope", projectId: 1 })).json.href!;
  const fromPdf = await extract(alice, { file: own });
  expect(fromPdf.status).toBe(200);
  expect(fromPdf.json.items).toEqual([{ kind: "included", title: "Devis - page 1", source: "devis.pdf" }]);
  // A PDF without words (a scan): the agency is told to paste its text.
  const blank = makePdf("Scan").toString("latin1").replace(/BT .* ET/, (drawn) => " ".repeat(drawn.length));
  const scan = (await upload(alice, Buffer.from(blank, "latin1"), "scan.pdf", { kind: "scope", projectId: 1 })).json.href!;
  const fromScan = await extract(alice, { file: scan });
  expect(fromScan.status).toBe(502);
  expect(fromScan.json.error).toContain("collez son texte");
  const fromText = await extract(alice, { text: "Logo — 3 formats\nNon inclus\nImpression" });
  expect(fromText.json.items).toEqual([
    { kind: "included", title: "Logo", quantity: 3, unit: "formats" },
    { kind: "excluded", title: "Impression" },
  ]);
  expect(await scopeOf(alice.organizationId!)).toBeUndefined();
});

test("the server keeps a scope to what it may say, and its activation to itself", async () => {
  const { alice, org } = await agencyWithProject();
  const pdf = (await upload(alice, makePdf("Devis"), "devis.pdf", { kind: "scope", projectId: 1 })).json.href!;
  const line = { id: 1, title: "Page d’accueil", quantity: 1, unit: "page" };

  // Not a scope; another agency's project.
  expect((await saveScope(alice, "tout")).status).toBe(400);
  const stranger = await signUp("Sam Dehors");
  await createAgency(stranger, "Autre Studio");
  expect((await saveScope(stranger, { lines: [line] })).status).toBe(404);

  // Its documents: the agency's own PDFs only.
  const foreign = (await upload(stranger, makePdf("Ailleurs"), "ailleurs.pdf", { kind: "scope", projectId: 1 })).json.href!;
  expect((await saveScope(alice, { lines: [line], sources: [{ id: 1, kind: "quote", name: "x.pdf", file: foreign }] })).status).toBe(404);
  const image = (await upload(alice, png, "capture.png", { kind: "scope", projectId: 1 })).json.href!;
  expect((await saveScope(alice, { lines: [line], sources: [{ id: 1, kind: "quote", name: "capture.png", file: image }] })).status).toBe(404);

  // A link: an http(s) address only, and never a file and a link at once.
  const sourcesOf = async () => (await scopeOf(org))?.sources;
  expect((await saveScope(alice, { lines: [line], sources: [{ id: 2, kind: "specs", name: "x", url: "javascript:alert(1)" }, { id: 3, kind: "specs", name: "y", url: "https://linear.app/t", file: pdf }] })).status).toBe(200);
  expect(await sourcesOf()).toEqual([]);

  // Activation: never from the page; refused without a line; kept by the server once given.
  expect((await saveScope(alice, { lines: [], activatedAt: 1, activatedBy: "Mallory" })).status).toBe(200);
  expect(await scopeOf(org)).not.toHaveProperty("activatedAt");
  expect((await call("/api/projects/1/scope/activation", { method: "POST", person: alice })).status).toBe(409);
  expect((await saveScope(alice, { lines: [line, { id: 2, title: "  " }], rounds: 2.5, budget: -3, deadline: "2026-02-31", sources: [{ id: 1, kind: "brief", name: "devis.pdf", file: pdf }] })).status).toBe(200);
  // Rows without a title left out; numbers and dates that are not ones, not kept.
  expect(await scopeOf(org)).toEqual({ lines: [line], exclusions: [], sources: [{ id: 1, kind: "brief", name: "devis.pdf", file: pdf }] });
  expect((await call("/api/projects/1/scope/activation", { method: "POST", person: alice })).status).toBe(200);
  const activatedAt = (await scopeOf(org))!.activatedAt;
  expect(activatedAt).toEqual(expect.any(Number));
  expect((await saveScope(alice, { lines: [{ ...line, quantity: 2 }], activatedAt: 1, activatedBy: "Mallory" })).status).toBe(200);
  expect(await scopeOf(org)).toMatchObject({ lines: [{ quantity: 2 }], activatedAt, activatedBy: "Alice Martin" });
});

test("the client's review never receives the project's scope", async () => {
  const { alice } = await agencyWithProject();
  const token = unique("tok-scope");
  const { linkKey } = await seedReview(alice, token);
  expect((await saveScope(alice, { lines: [{ id: 1, title: "Pages intérieures", quantity: 5 }], budget: 12000 })).status).toBe(200);
  const email = `${unique("claire")}@client.test`;
  await call("/api/review-access/invite", { person: alice, body: { linkKey, emails: [email] } });
  const client = await verifiedClient(token, email);
  const seen = await call(`/api/review/${token}`, { person: client });
  expect(seen.status).toBe(200);
  expect(JSON.stringify(seen.json)).not.toContain("Pages intérieures");
  expect(JSON.stringify(seen.json)).not.toContain("12000");
});
