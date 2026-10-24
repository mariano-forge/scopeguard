// A project's « Suivi »: figures and charts from its scope and what Kora holds, narrowed by deliverable and
// period. The « Clients » tab was tried, then dropped.

import { expect, test } from "@playwright/test";
import { call, createAgency, newPerson, seedState, signInPage, signUp, unique, type Member } from "./helpers";

/** A project with two deliverables (the mock-up in two versions, both shared), their requests, an accepted quote. */
async function agencyProject() {
  const alice = await signUp("Alice Martin");
  await createAgency(alice, "Studio Suivi");
  const claire = `${unique("claire")}@client.test`;
  const marc = `${unique("marc")}@client.test`;
  const hour = 60 * 60 * 1000;
  const request = (id: number, deliverableId: number, decision: string, title?: string, daysAgo = 2) => ({
    id, deliverableId, author: "Claire Dubois", initials: "CD", from: "client", kind: "request", message: title ?? `Demande ${id}`, ...(title ? { title } : {}), decision, location: "", time: "t",
    createdAt: Date.now() - daysAgo * 24 * hour,
  });
  // The agency answers the out-of-scope request two hours after it came.
  const answered = { ...request(40, 2, "Hors périmètre", "Page Équipe"), replies: [{ id: 401, author: "Alice Martin", initials: "AM", from: "agency", message: "Je chiffre", time: "t", createdAt: Date.now() - 2 * 24 * hour + 2 * hour }] };
  await seedState(alice, {
    lists: {
      clients: { upsert: [{ id: 1, name: "Northwind" }], remove: [] },
      projects: { upsert: [{ id: 1, name: "Refonte", clientId: 1, client: "Northwind", status: "En cours" }], remove: [] },
      deliverables: {
        upsert: [
          { id: 1, projectId: 1, name: "maquette.png", type: "Image", version: 1, status: "Remplacée", locked: true, importedAt: "01/10/2026 10:00" },
          { id: 2, projectId: 1, name: "maquette.png", type: "Image", version: 2, status: "En attente client", locked: false, importedAt: "10/10/2026 10:00" },
          { id: 3, projectId: 1, name: "logo.png", type: "Image", version: 1, status: "Approuvée", reviewStatus: "approved", locked: true, importedAt: "05/10/2026 10:00" },
        ],
        remove: [],
      },
      comments: { upsert: [answered, request(41, 2, "Inclus", "Titre plus court"), request(42, 1, "À qualifier", undefined, 9), request(43, 3, "Inclus", "Couleurs", 9), request(44, 3, "Inclus", "Contraste", 60)], remove: [] },
    },
    maps: {
      reviewLinks: {
        upsert: {
          "1:1": { token: unique("tok-v1"), active: true, expiresAt: "01/01/2099", autoExpire: true, deliverableId: 1, version: 1, invites: [{ email: claire, at: "x", role: "decider" }] },
          "2:2": { token: unique("tok-v2"), active: true, expiresAt: "01/01/2099", autoExpire: true, deliverableId: 2, version: 2, invites: [{ email: claire, at: "x", role: "decider" }, { email: marc, at: "x", role: "contributor" }] },
        },
        remove: [],
      },
      proposalStates: { upsert: { "40": "sent" }, remove: [] },
      proposalVersions: { upsert: { "40": [{ id: 400, commentId: 40, version: 1, amount: 600, deadline: 3, status: "accepted", createdAt: "x", description: "Page Équipe" }] }, remove: [] },
      proposalDecisions: { upsert: { "40": "accepted" }, remove: [] },
    },
  });
  return { alice, org: alice.organizationId!, claire, marc };
}

const saveScope = (member: Member, scope: unknown) => call("/api/projects/1/scope", { method: "PUT", person: member, body: { scope } });

test("« Suivi » shows what Kora brings: the out-of-scope work paid, the round trips, each version's requests, the weeks, the team's answers", async ({ browser }) => {
  const { alice } = await agencyProject();
  expect((await saveScope(alice, { budget: 12000, rounds: 2, lines: [{ id: 1, title: "Maquette accueil", quantity: 1 }] })).status).toBe(200);
  const { page, errors } = await newPerson(browser);
  await signInPage(page, alice.email);
  await page.goto("/projets/1");
  await page.getByRole("navigation", { name: "Sections du projet" }).getByRole("link", { name: /Suivi/ }).click();
  await expect(page).toHaveURL(/\/projets\/1\/suivi$/);
  // Three sections: the client tab is gone, its page and its route with it.
  await expect(page.getByRole("navigation", { name: "Sections du projet" }).getByRole("link")).toHaveText([/Livrables/, /Périmètre/, /Suivi/]);

  // The figures, each a value: the accepted 600 € quote; 1 request of 5 out of scope; 2 versions of the
  // mock-up and 1 of the logo; the agency answered the client in 2 hours.
  const figure = (name: string) => page.getByRole("group", { name }).locator(".tracking-figure-value");
  await expect(figure("Gagné grâce au hors scope")).toHaveText("+600 €");
  await expect(figure("Part des demandes hors scope")).toHaveText("20 %");
  await expect(figure("Versions par livrable, en moyenne")).toHaveText("1,5");
  await expect(figure("Délai de réponse de l’équipe")).toHaveText("2 h");

  // From found to accepted: each stage, how many requests and what they are worth; what is left to do beside.
  const funnel = page.getByRole("region", { name: "Du hors scope au devis accepté" });
  await expect(funnel.getByRole("img")).toHaveAttribute("aria-label", "Repérées : 1 demande ; Chiffrées : 1 demande, 600 € ; Envoyées : 1 demande, 600 € ; Acceptées : 1 demande, 600 €");
  await expect(funnel).toContainText("600 € de travail en plus payé, +5 % du budget");
  await expect(funnel.getByRole("definition")).toHaveText(["0 demande", "0 €", "Aucun"]);
  // Round trips: each deliverable's versions, the most revised first.
  const rounds = page.getByRole("region", { name: "Allers-retours par livrable" });
  await expect(rounds).toContainText("Chaque nouvelle version d’un livrable est un aller-retour avec le client");
  await expect(rounds.getByRole("img")).toHaveAttribute("aria-label", "maquette.png : 2 versions, logo.png : 1 version");

  // Before / after: all the deliverables first, then one of those with several versions.
  const versions = page.getByRole("region", { name: "Avant / après : demandes par version" });
  await expect(versions).toContainText("V01 : 1 demande → V02 : 2 demandes");
  await expect(versions).toContainText("+100 %");
  await expect(versions.getByRole("img")).toHaveAttribute("aria-label", "Tous les livrables : V01 : 1 demande, V02 : 2 demandes");
  await versions.getByRole("combobox", { name: "Livrable comparé" }).click();
  await expect(page.getByRole("option")).toHaveText(["Tous les livrables", "maquette.png"]);
  await page.getByRole("option", { name: "maquette.png" }).click();
  await expect(versions.getByRole("img")).toHaveAttribute("aria-label", "maquette.png : V01 : 1 demande, V02 : 2 demandes");

  // The weeks: the 5 requests, by qualification, and since when.
  const weekly = page.getByRole("region", { name: "Demandes par semaine" });
  await expect(weekly).toContainText("à aujourd’hui · 5 demandes");
  await expect(weekly.getByRole("listitem").filter({ hasText: "Inclus" })).toContainText("3");
  await expect(weekly.getByRole("listitem").filter({ hasText: "Hors scope" })).toContainText("1");
  await expect(weekly.getByRole("listitem").filter({ hasText: "À clarifier" })).toContainText("1");

  // Each section has its own filters: the weeks' period leaves out the 60-day-old request there only…
  await weekly.getByRole("combobox", { name: "Période" }).click();
  await page.getByRole("option", { name: "4 dernières semaines" }).click();
  await expect(weekly).toContainText("à aujourd’hui · 4 demandes");
  await expect(page.getByRole("group", { name: "Part des demandes hors scope" }).locator(".tracking-figure-value")).toHaveText("20 %");
  // …and one deliverable keeps its own requests: the logo's one in the period.
  await weekly.getByRole("combobox", { name: "Livrable" }).click();
  await page.getByRole("option", { name: "logo.png" }).click();
  await expect(weekly).toContainText("à aujourd’hui · 1 demande");
  // The out-of-scope requests narrowed on their own: none on the logo.
  await funnel.getByRole("combobox", { name: "Livrable" }).click();
  await page.getByRole("option", { name: "logo.png" }).click();
  await expect(funnel).toContainText("Aucune demande hors scope sur ces filtres");
  await expect(page.getByRole("group", { name: "Gagné grâce au hors scope" }).locator(".tracking-figure-value")).toHaveText("+600 €");
  // One click back to the whole project.
  await funnel.getByRole("button", { name: "Tout afficher" }).click();
  await expect(funnel.getByRole("img")).toHaveAttribute("aria-label", /^Repérées : 1 demande/);
  await expect(funnel.getByRole("combobox", { name: "Livrable" })).toHaveText("Tous les livrables");
  expect(errors).toEqual([]);
});

test("« Suivi » of a project with nothing yet says, section by section, what will show there and how", async ({ browser }) => {
  const alice = await signUp("Alice Martin");
  await createAgency(alice, "Studio Vide");
  await seedState(alice, {
    lists: {
      clients: { upsert: [{ id: 1, name: "Northwind" }], remove: [] },
      projects: { upsert: [{ id: 1, name: "Refonte", clientId: 1, client: "Northwind", status: "En cours" }], remove: [] },
    },
  });
  const { page, errors } = await newPerson(browser);
  await signInPage(page, alice.email);
  await page.goto("/projets/1/suivi");
  const section = (name: string) => page.getByRole("region", { name });
  await expect(section("Du hors scope au devis accepté")).toContainText("Aucune demande hors scope pour l’instant");
  await expect(section("Du hors scope au devis accepté")).toContainText("Qualifiez « Hors scope » une demande qui dépasse le devis");
  await expect(section("Avant / après : demandes par version")).toContainText("Pas encore de deuxième version");
  await expect(section("Demandes par semaine")).toContainText("Aucune demande reçue");
  // Nothing filtered: nothing to reset.
  await expect(page.getByRole("button", { name: "Tout afficher" })).toHaveCount(0);
  // The deliverables are the step that fills it: one click to them.
  await expect(section("Allers-retours par livrable")).toContainText("Aucun livrable dans ce projet");
  await section("Allers-retours par livrable").getByRole("link", { name: "Aller aux livrables" }).click();
  await expect(page).toHaveURL(/\/projets\/1$/);
  expect(errors).toEqual([]);
});

test("« Suivi » without a scope still reads the requests, without a banner of its own (the deliverables recommend the scope)", async ({ browser }) => {
  const { alice } = await agencyProject();
  const { page, errors } = await newPerson(browser);
  await signInPage(page, alice.email);
  await page.goto("/projets/1/clients");
  await expect(page.getByText("Cette page n’existe pas")).toBeVisible();
  expect((await call("/api/projects/1/client", { method: "PUT", person: alice, body: { client: { organization: "Northwind", contacts: [] } } })).status).toBe(404);
  await page.goto("/projets/1/suivi");
  await expect(page.getByRole("group", { name: "Gagné grâce au hors scope" }).locator(".tracking-figure-value")).toHaveText("+600 €");
  await expect(page.getByRole("region", { name: "Allers-retours par livrable" }).getByRole("img")).toHaveAttribute("aria-label", "maquette.png : 2 versions, logo.png : 1 version");
  await expect(page.getByRole("note")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("« Demandes par semaine » shows few weeks as bars with their figures, and a trend as lines", async ({ browser }) => {
  const alice = await signUp("Alice Martin");
  await createAgency(alice, "Studio Semaine");
  const request = (id: number, decision: string, daysAgo: number, deliverableId = 1) => ({
    id, deliverableId, author: "Claire Dubois", initials: "CD", from: "client", kind: "request", message: `Demande ${id}`, title: `Demande ${id}`, decision, location: "", time: "t", createdAt: Date.now() - daysAgo * 24 * 60 * 60 * 1000,
  });
  await seedState(alice, {
    lists: {
      clients: { upsert: [{ id: 1, name: "Northwind" }], remove: [] },
      projects: { upsert: [{ id: 1, name: "Refonte", clientId: 1, client: "Northwind", status: "En cours" }], remove: [] },
      deliverables: {
        upsert: [
          { id: 1, projectId: 1, name: "maquette.png", type: "Image", version: 1, status: "En attente client", locked: false, importedAt: "x" },
          { id: 2, projectId: 1, name: "logo.png", type: "Image", version: 1, status: "En attente client", locked: false, importedAt: "x" },
        ],
        remove: [],
      },
      comments: { upsert: [request(1, "Inclus", 0), request(2, "Inclus", 0), request(3, "Hors périmètre", 0), request(4, "Inclus", 40, 2)], remove: [] },
    },
  });
  const { page, errors } = await newPerson(browser);
  await signInPage(page, alice.email);
  await page.goto("/projets/1/suivi");
  const weekly = page.getByRole("region", { name: "Demandes par semaine" });
  // Since the start: six weeks or more, a trend, drawn as lines.
  await expect(weekly.locator(".recharts-line")).toHaveCount(3);
  // The mock-up alone: one week of requests, side by side with their numbers, none hidden behind another.
  await weekly.getByRole("combobox", { name: "Livrable" }).click();
  await page.getByRole("option", { name: "maquette.png" }).click();
  await expect(weekly.locator(".recharts-line")).toHaveCount(0);
  await expect(weekly.locator(".recharts-bar-rectangle").first()).toBeVisible();
  await expect(weekly.locator(".recharts-label-list")).toContainText(["2", "1"]);
  expect(errors).toEqual([]);
});
