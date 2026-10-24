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

test("qualifying a request: the AI's suggestion pre-fills the form, the cited line is kept, the client and the proof read it, never the suggestion", async ({ browser }) => {
  const { alice, org, token, linkKey } = await agency();
  const { page, errors } = await editor(browser, alice.email);

  await page.locator('[data-pin="30"]').click();
  await page.getByRole("button", { name: "Qualifier", exact: true }).click();
  const note = page.getByRole("region", { name: "Suggestion de l’IA" });
  await expect(note).toContainText("Suggestion : Inclus");
  await expect(note).toContainText("ligne « Page Contact avec formulaire »");
  await expect(note).toContainText("la décision reste la vôtre");
  // Pre-filled, not saved: the choice, the cited line and a title.
  await expect(page.getByRole("radio", { name: /^Inclus/ })).toBeChecked();
  await expect(page.getByLabel("Ligne du périmètre")).toHaveValue("1");
  await expect(page.getByLabel("Titre de la demande")).toHaveValue("Le formulaire de contact n’envoie rien");
  // The bubble keeps its width: nothing to scroll sideways.
  expect(await page.locator(".thread").evaluate((bubble) => bubble.scrollWidth <= bubble.clientWidth)).toBe(true);
  expect((await commentData(org, 30)).decision).toBe("À qualifier");
  await page.getByRole("button", { name: "Créer la demande" }).click();

  await expect.poll(() => commentData(org, 30)).toMatchObject({ decision: "Inclus", title: "Le formulaire de contact n’envoie rien", scopeLine: { id: 1, title: "Page Contact avec formulaire" } });
  const [event] = await sql<{ description: string }>("select data->>'description' as description from audit_events where organization_id = $1 and type = 'scope.classified'", [org]);
  expect(event.description).toBe("Demande qualifiée « Inclus » : Le formulaire de contact n’envoie rien (ligne du périmètre : Page Contact avec formulaire)");
  // The request says which line provides for it.
  await expect(page.getByRole("dialog", { name: /^Demande incluse #30$/ })).toContainText("Prévu par la ligne du périmètre : Page Contact avec formulaire");

  // The client reads the cited line; nothing of the suggestion (its reason) reaches them.
  const email = `${unique("claire")}@client.test`;
  await call("/api/review-access/invite", { person: alice, body: { linkKey, emails: [email] } });
  const client = await verifiedClient(token, email);
  const state = (await call(`/api/review/${token}`, { person: client })).json.state as { comments: { id: number; scopeLine?: unknown }[] };
  expect(state.comments.find((comment) => comment.id === 30)?.scopeLine).toEqual({ id: 1, title: "Page Contact avec formulaire" });
  expect(JSON.stringify(state)).not.toContain("Prévu par la ligne « ");
  // The proof keeps it.
  const proof = (await call("/api/proof/1", { person: alice })).json as { requests: { id: number; scopeLine: string | null }[] };
  expect(proof.requests.find((request) => request.id === 30)?.scopeLine).toBe("Page Contact avec formulaire");
  expect(errors).toEqual([]);
});

test("without an active scope, the form says what would bring suggestions, and offers no line to cite", async ({ browser }) => {
  const { alice } = await agency({ active: false });
  const { page, errors } = await editor(browser, alice.email);
  await page.locator('[data-pin="30"]').click();
  await page.getByRole("button", { name: "Qualifier", exact: true }).click();
  await expect(page.getByRole("region", { name: "Suggestion de l’IA" })).toContainText("Activez le périmètre du projet pour que l’IA suggère une qualification.");
  await page.getByRole("radio", { name: /^Inclus/ }).click();
  await expect(page.getByLabel("Ligne du périmètre")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("« + Demande »: the AI reads what is typed when asked; the agency changes the cited line before creating", async ({ browser }) => {
  const { alice, org } = await agency();
  const { page, errors } = await editor(browser, alice.email);
  await page.getByRole("button", { name: "Ajouter une demande" }).click();
  await expect(page.getByRole("heading", { name: "Nouvelle demande" })).toBeVisible();
  const ask = page.getByRole("button", { name: "Suggérer avec l’IA" });
  // Nothing to read yet.
  await expect(ask).toBeDisabled();
  await page.getByLabel("Description").fill("Le client veut que le formulaire de contact envoie une copie au visiteur.");
  await ask.click();
  await expect(page.getByRole("region", { name: "Suggestion de l’IA" })).toContainText("Suggestion : Inclus");
  await expect(page.getByRole("radio", { name: /^Inclus/ })).toBeChecked();
  await expect(page.getByLabel("Ligne du périmètre")).toHaveValue("1");
  await expect(page.getByLabel("Titre de la demande")).toHaveValue("Le client veut que le formulaire de contact envoie une copie au visiteur");
  // The agency decides: another line.
  await page.getByLabel("Ligne du périmètre").selectOption({ label: "Pages vitrine · 5 pages" });
  await page.getByLabel("Titre de la demande").fill("Copie du formulaire au visiteur");
  await page.getByRole("button", { name: "Créer la demande" }).click();
  await expect
    .poll(async () => (await sql<{ data: Record<string, unknown> }>("select data from comments where organization_id = $1 and data->>'title' = 'Copie du formulaire au visiteur'", [org]))[0]?.data)
    .toMatchObject({ decision: "Inclus", scopeLine: { id: 2, title: "Pages vitrine · 5 pages" } });
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
