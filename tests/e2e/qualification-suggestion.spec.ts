// The AI's suggestion when the agency qualifies a request (US-045, src/db/qualificationSuggestion.ts): asked
// against the project's active scope, it only pre-fills the form; the agency decides. The line of the scope
// an « Inclus » cites is kept with the request (src/lib/scopeCitation.ts), read by the client and the
// proof; the suggestion itself never is. The tests' model (AI_PROVIDER=fake, src/lib/ai/provider.ts):
// « Inclus » when a word of a line's title is in the request, its first sentence as the title.

import { expect, test, type Browser } from "@playwright/test";
import { call, createAgency, newPerson, seedReview, seedState, signInPage, signUp, sql, unique, verifiedClient, type Person } from "./helpers";

const scope = (active: boolean) => ({
  sources: [],
  lines: [
    { id: 1, title: "Page Contact avec formulaire" },
    { id: 2, title: "Pages vitrine", quantity: 5, unit: "pages" },
    // A line as long as real quotes have: the list of lines must not widen the form.
    { id: 3, title: "Flyer Pains au chocolat : visuel principal, déclinaisons pour les réseaux sociaux et version imprimable A5 recto verso" },
  ],
  exclusions: [{ id: 1, title: "Rédaction des textes" }],
  ...(active ? { activatedAt: Date.now(), activatedBy: "Alice Martin" } : {}),
});

async function agency({ active = true } = {}) {
  const alice = await signUp("Alice Martin");
  await createAgency(alice, "Studio Suggestions");
  const token = unique("tok-suggestion");
  const { linkKey } = await seedReview(alice, token);
  await seedState(alice, {
    lists: {
      projects: { upsert: [{ id: 1, name: "Refonte", clientId: 1, client: "Northwind", status: "En cours", scope: scope(active) }], remove: [] },
      comments: {
        upsert: [
          {
            id: 30,
            deliverableId: 1,
            author: "Claire Dubois",
            initials: "CD",
            from: "client",
            message: "Le formulaire de contact n’envoie rien. Joignable au 06 12 34 56 78 ou claire@nordic.test",
            decision: "À qualifier",
            kind: "remark",
            location: "Page 1",
            page: 1,
            position: { x: 70, y: 70 },
            time: "t",
          },
        ],
        remove: [],
      },
    },
  });
  return { alice, org: alice.organizationId!, token, linkKey };
}

async function editor(browser: Browser, email: string) {
  const { page, errors } = await newPerson(browser);
  await signInPage(page, email);
  await page.goto("/projets/1/livrables/1");
  await expect(page.locator("[data-page]").first()).toBeVisible();
  return { page, errors };
}

const commentData = async (org: string, id: number) =>
  (await sql<{ data: Record<string, unknown> }>("select data from comments where organization_id = $1 and id = $2", [org, id]))[0]?.data;

test("qualifying a request: the AI's suggestion pre-fills the form, the agency decides; the client and the proof never read the suggestion", async ({ browser }) => {
  const { alice, org, token, linkKey } = await agency();
  const { page, errors } = await editor(browser, alice.email);

  await page.locator('[data-pin="30"]').click();
  await page.getByRole("button", { name: "Qualifier", exact: true }).click();
  const note = page.getByRole("region", { name: "Suggestion de l’IA" });
  await expect(note).toContainText("Suggestion de l’IA : Inclus");
  await expect(note).toContainText("Vérifiez chaque ligne du formulaire pré-rempli avant d’enregistrer.");
  // Its reason folds away on demand.
  await note.getByText("Suggestion de l’IA").click();
  await expect(note.locator(".qualify-suggestion-reason")).toBeHidden();
  await note.getByText("Suggestion de l’IA").click();
  await expect(note.locator(".qualify-suggestion-reason")).toBeVisible();
  // Pre-filled, not saved: the choice and a title; no line of the scope to cite.
  await expect(page.getByRole("radio", { name: /^Inclus/ })).toBeChecked();
  await expect(page.getByLabel("Ligne du périmètre")).toHaveCount(0);
  await expect(page.getByLabel("Titre de la demande")).toHaveValue("Le formulaire de contact n’envoie rien");
  // The bubble keeps its width: nothing to scroll sideways.
  expect(await page.locator(".thread").evaluate((bubble) => bubble.scrollWidth <= bubble.clientWidth)).toBe(true);
  expect((await commentData(org, 30)).decision).toBe("À qualifier");
  await page.getByRole("button", { name: "Créer la demande" }).click();

  await expect.poll(() => commentData(org, 30)).toMatchObject({ decision: "Inclus", title: "Le formulaire de contact n’envoie rien" });
  expect((await commentData(org, 30)).scopeLine).toBeUndefined();
  const [event] = await sql<{ description: string }>("select data->>'description' as description from audit_events where organization_id = $1 and type = 'scope.classified'", [org]);
  expect(event.description).toBe("Demande qualifiée « Inclus » : Le formulaire de contact n’envoie rien");

  // Nothing of the suggestion (its reason) reaches the client.
  const email = `${unique("claire")}@client.test`;
  await call("/api/review-access/invite", { person: alice, body: { linkKey, emails: [email] } });
  const client = await verifiedClient(token, email);
  const state = (await call(`/api/review/${token}`, { person: client })).json.state as { comments: { id: number; scopeLine?: unknown }[] };
  expect(state.comments.find((comment) => comment.id === 30)?.scopeLine).toBeUndefined();
  expect(JSON.stringify(state)).not.toContain("Prévu par la ligne « ");
  expect(errors).toEqual([]);
});

test("while the canvas zooms, an open bubble stays where it is on screen, at its size; then it is back by its pin", async ({ browser }) => {
  const { alice } = await agency();
  const { page, errors } = await editor(browser, alice.email);
  await page.locator('[data-pin="30"]').click();
  const bubble = page.locator(".canvas-page .thread");
  await expect(bubble).toBeVisible();
  // Once the canvas has settled from opening the bubble (it may glide to its pin): a pan moves the bubble with it.
  const transform = () => page.locator(".artboard-transform-content").evaluate((node) => getComputedStyle(node).transform);
  let last = "";
  await expect.poll(async () => last === (last = await transform())).toBe(true);
  const gap = async () => (await bubble.boundingBox())!.x - (await page.locator('[data-pin="30"]').boundingBox())!.x;
  const before = { gap: await gap(), width: (await bubble.boundingBox())!.width };
  // Every frame of the zoom: the bubble where it was, its width the same.
  const samples = await page.evaluate(
    () =>
      new Promise<{ x: number; y: number; width: number }[]>((resolve) => {
        const thread = document.querySelector<HTMLElement>(".canvas-page .thread")!;
        const read = () => {
          const box = thread.getBoundingClientRect();
          return { x: box.x, y: box.y, width: box.width };
        };
        const seen = [read()];
        document.querySelector<HTMLButtonElement>('[aria-label="Augmenter le zoom"]')!.click();
        const started = performance.now();
        const frame = () => {
          seen.push(read());
          if (performance.now() - started < 250) requestAnimationFrame(frame);
          else resolve(seen);
        };
        requestAnimationFrame(frame);
      }),
  );
  for (const sample of samples) {
    expect(Math.abs(sample.x - samples[0].x)).toBeLessThan(1.5);
    expect(Math.abs(sample.y - samples[0].y)).toBeLessThan(1.5);
    expect(Math.abs(sample.width - samples[0].width)).toBeLessThan(1.5);
  }
  // The zoom over: back by its pin, as far from it as before, its size unchanged.
  await expect.poll(async () => Math.abs((await gap()) - before.gap)).toBeLessThan(2);
  expect(Math.abs((await bubble.boundingBox())!.width - before.width)).toBeLessThan(1.5);
  expect(errors).toEqual([]);
});

test("on a low screen, the qualifying bubble of a request placed low stays whole between the top of the canvas and its toolbar", async ({ browser }) => {
  const { alice } = await agency();
  await sql("update comments set data = jsonb_set(data, '{position}', '{\"x\": 50, \"y\": 90}') where organization_id = $1 and id = 30", [alice.organizationId]);
  const { page, errors } = await newPerson(browser);
  await page.setViewportSize({ width: 1366, height: 640 });
  await signInPage(page, alice.email);
  await page.goto("/projets/1/livrables/1");
  await expect(page.locator("[data-page]").first()).toBeVisible();
  await page.locator('[data-pin="30"]').click();
  await page.getByRole("button", { name: "Qualifier", exact: true }).click();
  await expect(page.getByRole("region", { name: "Suggestion de l’IA" })).toContainText("Suggestion de l’IA : Inclus");
  // Once the canvas has moved (and the bubble shrunk to the room, if need be): whole, its buttons in view.
  const gaps = () =>
    page.evaluate(() => {
      const bubble = document.querySelector(".thread")!.getBoundingClientRect();
      const toolbar = document.querySelector(".canvas-toolbar")!.getBoundingClientRect();
      const frame = document.querySelector(".artboard-transform-wrapper")!.getBoundingClientRect();
      return Math.min(toolbar.top - bubble.bottom, bubble.top - frame.top);
    });
  await expect.poll(gaps).toBeGreaterThanOrEqual(0);
  await expect(page.getByRole("button", { name: "Créer la demande" })).toBeInViewport();
  expect(errors).toEqual([]);
});

test("a request without pin: changing its qualification back and forth never moves the canvas behind its bubble", async ({ browser }) => {
  const { alice, org } = await agency();
  expect((await call("/api/comments", { method: "POST", person: alice, body: { request: { deliverableId: 1, decision: "À qualifier", title: "Page Équipe" } } })).status).toBe(200);
  const [{ id }] = await sql<{ id: string }>("select id from comments where organization_id = $1 and data->>'title' = 'Page Équipe'", [org]);
  const { page, errors } = await editor(browser, alice.email);
  await page.getByRole("button", { name: `Demande à clarifier #${id}` }).click();
  const bubble = page.getByRole("dialog", { name: `Demande à clarifier #${id}` });
  await bubble.getByRole("button", { name: "Modifier", exact: true }).click();
  const canvas = page.locator(".artboard-transform-content");
  const transform = () => canvas.evaluate((node) => getComputedStyle(node).transform);
  // Once the canvas has settled from fitting the page to its width.
  let last = "";
  await expect.poll(async () => last === (last = await transform())).toBe(true);
  const before = last;
  // The proposal comes and goes with « Hors scope »: the bubble grows and shrinks, the canvas stays.
  for (const choice of [/^Inclus/, /Hors scope/, /^Inclus/, /^À clarifier/, /^Inclus/]) {
    await page.getByRole("radio", { name: choice }).click();
    await expect(page.getByRole("radio", { name: choice })).toBeChecked();
  }
  await expect(page.getByRole("radio", { name: /^Inclus/ })).toBeChecked();
  // A pan would show within its animation and the checks after it (src/app/(agency)/editor/ReviewCanvas.tsx).
  await expect.poll(async () => last === (last = await transform())).toBe(true);
  expect(last).toBe(before);
  await expect(page.getByRole("button", { name: "Enregistrer" })).toBeInViewport();
  expect(errors).toEqual([]);
});

test("a request without pin opens its bubble facing its card in the list, not at the top of the canvas", async ({ browser }) => {
  const { alice, org } = await agency();
  for (const title of ["Demande A", "Demande B", "Demande C", "Demande D", "Demande E", "Demande F"])
    expect((await call("/api/comments", { method: "POST", person: alice, body: { request: { deliverableId: 1, decision: "À qualifier", title } } })).status).toBe(200);
  const { page, errors } = await editor(browser, alice.email);
  const top = (selector: string) => page.locator(selector).evaluate((node) => node.getBoundingClientRect().top);
  for (const title of ["Demande A", "Demande F"]) {
    const [{ id }] = await sql<{ id: string }>("select id from comments where organization_id = $1 and data->>'title' = $2", [org, title]);
    await page.getByRole("button", { name: `Demande à clarifier #${id}` }).click();
    await expect(page.getByRole("dialog", { name: `Demande à clarifier #${id}` })).toBeVisible();
    // Level with its card (within a few pixels), as long as it fits above the toolbar.
    await expect.poll(async () => Math.abs((await top(".canvas-docked-thread")) - (await top(".inspector-row.is-selected")))).toBeLessThan(4);
  }
  expect(errors).toEqual([]);
});

test("a request back to clarify is suggested again when modified, its title kept; an « Inclus » already settled is not", async ({ browser }) => {
  const { alice, org } = await agency();
  const create = async (title: string, decision: string) => {
    expect((await call("/api/comments", { method: "POST", person: alice, body: { request: { deliverableId: 1, decision, title } } })).status).toBe(200);
    return (await sql<{ id: string }>("select id from comments where organization_id = $1 and data->>'title' = $2", [org, title]))[0].id;
  };
  const clarify = await create("Formulaire de contact cassé", "À qualifier");
  const settled = await create("Bandeau cookies", "Inclus");
  const asked: string[] = [];
  const { page, errors } = await editor(browser, alice.email);
  page.on("request", (request) => request.url().endsWith("/suggestion") && asked.push(new URL(request.url()).pathname));

  await page.getByRole("button", { name: `Demande à clarifier #${clarify}` }).click();
  await page.getByRole("dialog", { name: `Demande à clarifier #${clarify}` }).getByRole("button", { name: "Modifier", exact: true }).click();
  await expect(page.getByRole("region", { name: "Suggestion de l’IA" })).toContainText("Suggestion de l’IA : Inclus");
  await expect(page.getByRole("radio", { name: /^Inclus/ })).toBeChecked();
  // The title the agency gave stays.
  await expect(page.getByLabel("Titre de la demande")).toHaveValue("Formulaire de contact cassé");
  await page.getByRole("button", { name: "Annuler" }).click();

  await page.getByRole("tab", { name: /^Inclus/ }).click();
  await page.getByRole("button", { name: `Demande incluse #${settled}` }).click();
  await page.getByRole("dialog", { name: `Demande incluse #${settled}` }).getByRole("button", { name: "Modifier", exact: true }).click();
  await expect(page.getByLabel("Titre de la demande")).toHaveValue("Bandeau cookies");
  await expect(page.getByRole("region", { name: "Suggestion de l’IA" })).toHaveCount(0);
  expect(asked).toEqual([`/api/comments/${clarify}/suggestion`]);
  expect(errors).toEqual([]);
});

test("without an active scope, the form says what would bring suggestions, and offers no line to cite", async ({ browser }) => {
  const { alice } = await agency({ active: false });
  const { page, errors } = await editor(browser, alice.email);
  await page.locator('[data-pin="30"]').click();
  await page.getByRole("button", { name: "Qualifier", exact: true }).click();
  await expect(page.getByRole("region", { name: "Suggestion de l’IA" })).toContainText("Activez le périmètre du projet pour recevoir une suggestion de l’IA.");
  await page.getByRole("radio", { name: /^Inclus/ }).click();
  await expect(page.getByLabel("Ligne du périmètre")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("« + Demande »: the AI reads what is typed when asked; the agency changes what it pre-filled before creating", async ({ browser }) => {
  const { alice, org } = await agency();
  const { page, errors } = await editor(browser, alice.email);
  await page.getByRole("button", { name: "Ajouter une demande" }).click();
  await expect(page.getByRole("heading", { name: "Nouvelle demande" })).toBeVisible();
  const ask = page.getByRole("button", { name: "Suggérer avec l’IA" });
  // Nothing to read yet: not offered; then, once something is typed.
  await expect(ask).toHaveCount(0);
  await page.getByLabel("Description").fill("Le client veut que le formulaire de contact envoie une copie au visiteur.");
  await expect(ask).toBeEnabled();
  await ask.click();
  await expect(page.getByRole("region", { name: "Suggestion de l’IA" })).toContainText("Suggestion de l’IA : Inclus");
  await expect(page.getByRole("radio", { name: /^Inclus/ })).toBeChecked();
  await expect(page.getByLabel("Ligne du périmètre")).toHaveCount(0);
  await expect(page.getByLabel("Titre de la demande")).toHaveValue("Le client veut que le formulaire de contact envoie une copie au visiteur");
  // The agency decides: its own title.
  await page.getByLabel("Titre de la demande").fill("Copie du formulaire au visiteur");
  await page.getByRole("button", { name: "Créer la demande" }).click();
  await expect
    .poll(async () => (await sql<{ data: Record<string, unknown> }>("select data from comments where organization_id = $1 and data->>'title' = 'Copie du formulaire au visiteur'", [org]))[0]?.data)
    .toMatchObject({ decision: "Inclus" });
  expect(errors).toEqual([]);
});

test("the suggestion is the agency's only, on its own requests; a cited line must be in the active scope, and only an « Inclus » keeps one", async () => {
  const { alice, org, token, linkKey } = await agency();
  const suggest = (person: Partial<Person> | undefined, path = "/api/comments/30/suggestion", body: unknown = {}) => call(path, { method: "POST", person, body });

  // Its own requests, signed in.
  expect((await suggest(undefined)).status).toBe(401);
  const stranger = await signUp("Sam Dehors");
  await createAgency(stranger, "Autre Studio");
  expect((await suggest(stranger)).status).toBe(404);
  expect((await suggest(stranger, "/api/deliverables/1/suggestion", { description: "Un formulaire" })).status).toBe(404);
  const email = `${unique("claire")}@client.test`;
  await call("/api/review-access/invite", { person: alice, body: { linkKey, emails: [email] } });
  const client = await verifiedClient(token, email);
  expect((await suggest(client)).status).toBe(401);
  // Something to read.
  expect((await suggest(alice, "/api/deliverables/1/suggestion", {})).status).toBe(400);
  // Asked, answered; nothing written.
  expect((await suggest(alice)).json).toMatchObject({ status: "ready", suggestion: { decision: "Inclus", line: { id: 1, title: "Page Contact avec formulaire" } } });
  expect((await commentData(org, 30)).decision).toBe("À qualifier");

  // A line the active scope does not have.
  const qualify = (body: Record<string, unknown>) => call("/api/comments/30/qualification", { method: "PUT", person: alice, body: { title: "Formulaire", ...body } });
  const refused = await qualify({ decision: "Inclus", scopeLineId: 99 });
  expect(refused.status).toBe(409);
  expect(refused.json.error).toBe("Cette ligne n’est pas dans le périmètre actif du projet.");
  // Out of scope: no line is kept.
  expect((await qualify({ decision: "Hors périmètre", scopeLineId: 1 })).status).toBe(200);
  expect((await commentData(org, 30)).scopeLine).toBeUndefined();
  // Cited, then back to clarify: the line goes with the qualification.
  expect((await qualify({ decision: "Inclus", scopeLineId: 2 })).status).toBe(200);
  expect((await commentData(org, 30)).scopeLine).toEqual({ id: 2, title: "Pages vitrine · 5 pages" });
  expect((await qualify({ decision: "À qualifier", title: undefined })).status).toBe(200);
  expect((await commentData(org, 30)).scopeLine).toBeUndefined();

  // A draft scope is cited by nobody.
  await seedState(alice, { lists: { projects: { upsert: [{ id: 1, name: "Refonte", clientId: 1, client: "Northwind", status: "En cours", scope: scope(false) }], remove: [] } } });
  expect((await qualify({ decision: "Inclus", scopeLineId: 1 })).status).toBe(409);
  expect((await suggest(alice)).json).toEqual({ status: "no-scope" });
});
