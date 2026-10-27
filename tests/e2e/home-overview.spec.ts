// The home page's tables: the breakdown by space, and the register of every request with its
// qualification, quote and client answer, each opening its request.

import { expect, test, type Page } from "@playwright/test";
import { createAgency, newPerson, seedState, signInPage, signUp } from "./helpers";

/** An amount as Kora writes it: a non-breaking space before the euro sign (an attribute is compared exactly). */
const euro = (amount: number) => `${amount}${String.fromCharCode(0xa0)}€`;

/** Two spaces, a deliverable each, four requests: included, out of scope (accepted, then awaiting), to clarify. */
async function agencyHome() {
  const alice = await signUp("Alice Martin");
  await createAgency(alice, "Studio Accueil");
  const request = (id: number, deliverableId: number, decision: string, title: string, location: string) => ({
    id, deliverableId, author: "Claire Dubois", initials: "CD", from: "client", kind: "request", message: title, title, decision, location, time: "t",
  });
  const quote = (id: number, commentId: number, amount: number, status: string) => [{ id, commentId, version: 1, amount, deadline: 3, status, createdAt: "x", description: "Devis" }];
  await seedState(alice, {
    lists: {
      clients: { upsert: [{ id: 1, name: "Northwind" }, { id: 2, name: "Globex" }], remove: [] },
      projects: {
        upsert: [
          { id: 1, name: "Refonte", clientId: 1, client: "Northwind", status: "En cours" },
          { id: 2, name: "Appli", clientId: 2, client: "Globex", status: "En cours" },
        ],
        remove: [],
      },
      deliverables: {
        upsert: [
          { id: 1, projectId: 1, name: "maquette.png", type: "Image", version: 1, status: "En attente client", locked: false, importedAt: "14/10/2026 10:00" },
          { id: 2, projectId: 2, name: "logo.png", type: "Image", version: 1, status: "En attente client", locked: false, importedAt: "15/10/2026 10:00" },
        ],
        remove: [],
      },
      comments: {
        upsert: [
          request(10, 1, "Inclus", "Agrandir le titre", "Page 1"),
          request(11, 1, "Hors périmètre", "Page Équipe", "Page 2"),
          request(12, 2, "Hors périmètre", "Section blog", "Page 1"),
          request(13, 2, "À qualifier", "Quelle police ?", "Page 1"),
        ],
        remove: [],
      },
    },
    maps: {
      proposalStates: { upsert: { "11": "sent", "12": "sent" }, remove: [] },
      proposalVersions: { upsert: { "11": quote(110, 11, 600, "accepted"), "12": quote(120, 12, 900, "sent") }, remove: [] },
      proposalDecisions: { upsert: { "11": "accepted" }, remove: [] },
    },
  });
  return alice;
}

/** A section of the home page, by the start of its title. */
const section = (page: Page, title: RegExp) => page.locator(".browser-section").filter({ has: page.getByRole("heading", { level: 2, name: title }) });

test("the home page lists every request, each opening its own, and sums each space", async ({ browser }) => {
  const alice = await agencyHome();
  const { page, errors } = await newPerson(browser);
  await signInPage(page, alice.email);
  await page.goto("/");

  // The register: the newest request first, its title only, no internal number.
  const register = section(page, /^Registre des demandes/);
  await expect(register.getByRole("heading", { level: 2 })).toHaveText("Registre des demandes · 4");
  const rows = register.getByRole("row").filter({ has: page.getByRole("link", { name: /^Ouvrir la demande/ }) });
  await expect(rows).toHaveCount(4);
  await expect(rows.first().getByRole("rowheader")).toHaveText("Quelle police ?");
  await expect(rows.first()).not.toContainText("Page 1");
  await expect(register).not.toContainText("#13");
  // Its deliverable and version apart, the quote's amount alone, where its proposal stands.
  const blog = rows.filter({ hasText: "Section blog" });
  await expect(blog.getByRole("cell")).toHaveText(["logo.png", "V01", "Hors scope", "900 €", "En attente du client", ""]);
  await expect(rows.filter({ hasText: "Page Équipe" })).toContainText("Acceptée");
  await expect(rows.filter({ hasText: "Agrandir le titre" }).getByRole("cell").nth(4)).toHaveText("—");
  await expect(blog.getByRole("link", { name: /^Ouvrir la demande/ })).toHaveAttribute("href", "/projets/2/livrables/2?demande=12");
  // Five rows a page to begin with.
  await expect(register.getByRole("combobox", { name: "Lignes par page" })).toHaveText("5");

  // By space: its projects and deliverables, what is left to clarify, out of scope, accepted.
  const spaces = section(page, /^Demandes et revenus par espace/);
  const northwind = spaces.getByRole("row").filter({ has: page.getByRole("link", { name: "Northwind" }) });
  await expect(northwind.getByRole("cell")).toHaveText(["1", "1", "0", "1", "600 €"]);
  const globex = spaces.getByRole("row").filter({ has: page.getByRole("link", { name: "Globex" }) });
  await expect(globex.getByRole("cell")).toHaveText(["1", "1", "1", "1", "0 €"]);
  await expect(spaces.getByRole("link", { name: "Globex" })).toHaveAttribute("href", "/espaces/2");
  expect(errors).toEqual([]);
});

test("« Arbitrages de périmètre » and « Propositions au client »: two sections, a column each, its figures under it", async ({ browser }) => {
  const alice = await agencyHome();
  const { page, errors } = await newPerson(browser);
  await signInPage(page, alice.email);
  await page.goto("/");
  // 4 requests: 1 included, 2 out of scope, 1 to clarify; each with its share; their count in a tile under the chart.
  const scope = section(page, /^Arbitrages de périmètre/);
  await expect(scope.getByRole("img")).toHaveAttribute(
    "aria-label",
    "Demandes par qualification : Inclus, 1 demande · 25 % ; Hors scope, 2 demandes · 50 % ; À clarifier, 1 demande · 25 %",
  );
  await expect(scope).toContainText("Demandes qualifiées4");
  await expect(scope).toContainText("Versions totales2");
  // A tile says in full what it counts, on hover.
  await scope.getByRole("button", { name: /^Temps non facturé évité :/ }).hover();
  await expect(page.getByRole("tooltip")).toContainText("à 7 h par jour");

  // The proposals, status by status as in the editor and the register: one awaiting the client (900 €), one accepted (600 €).
  const proposals = section(page, /^Propositions au client/);
  await expect(proposals.getByRole("img")).toHaveAttribute(
    "aria-label",
    [
      "Demandes hors scope par état de leur proposition : À chiffrer, 0 proposition",
      `Prête pour l’envoi, 0 proposition · ${euro(0)}`,
      `En attente du client, 1 proposition · ${euro(900)}`,
      `Contre-proposition reçue, 0 proposition · ${euro(0)}`,
      `Acceptée, 1 proposition · ${euro(600)}`,
      `Refusée, 0 proposition · ${euro(0)}`,
      `Offerte, 0 proposition · ${euro(0)}`,
    ].join(" ; "),
  );
  // Each column's count above it, as tall as it; its amount on hover.
  await expect(proposals.locator(".recharts-label-list")).toHaveText("0010100");
  await expect(proposals).toContainText(/Total chiffré1\s?500\s€/);
  await expect(proposals).toContainText("Valeur capturée+600 €");
  await expect(proposals).toContainText("Offert au client0 €");
  // Each section narrows on its own.
  await expect(scope.getByRole("button", { name: /Filtrer « Arbitrages de périmètre »/ })).toBeVisible();
  await expect(proposals.getByRole("button", { name: /Filtrer « Propositions au client »/ })).toBeVisible();
  expect(errors).toEqual([]);
});

test("the spaces come before the register; both sort by any column, and the register is searched and filtered", async ({ browser }) => {
  const alice = await agencyHome();
  const { page, errors } = await newPerson(browser);
  await signInPage(page, alice.email);
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 2 })).toContainText([
    "Chiffres clés",
    "Arbitrages de périmètre",
    "Propositions au client",
    "Demandes et revenus par espace",
    /^Registre des demandes/,
  ]);

  // By space: biggest first on a figure, then the other way.
  const spaces = section(page, /^Demandes et revenus par espace/);
  const spaceNames = spaces.getByRole("rowheader");
  const earned = spaces.getByRole("columnheader", { name: "Revenu accepté" });
  await expect(earned).toHaveAttribute("aria-sort", "none");
  await earned.getByRole("button").click();
  await expect(earned).toHaveAttribute("aria-sort", "descending");
  // Each name comes after its space's avatar letter.
  await expect(spaceNames).toHaveText([/Northwind$/, /Globex$/]);
  await earned.getByRole("button").click();
  await expect(earned).toHaveAttribute("aria-sort", "ascending");
  await expect(spaceNames).toHaveText([/Globex$/, /Northwind$/]);

  // The register, by amount: the biggest quote first, the requests without one after.
  const register = section(page, /^Registre des demandes/);
  const titles = register.getByRole("rowheader");
  await register.getByRole("columnheader", { name: "Chiffrage" }).getByRole("button").click();
  await expect(titles).toHaveText(["Section blog", "Page Équipe", "Quelle police ?", "Agrandir le titre"]);
  await register.getByRole("columnheader", { name: "Demande" }).getByRole("button").click();
  await expect(titles).toHaveText(["Agrandir le titre", "Page Équipe", "Quelle police ?", "Section blog"]);

  // Searched without accents; filtered by qualification and by where the proposal stands.
  const search = register.getByRole("searchbox", { name: "Rechercher dans le registre" });
  await search.fill("equipe");
  await expect(titles).toHaveText(["Page Équipe"]);
  await expect(register).toContainText("1–1 sur 1 (4 au total)");
  await register.getByRole("button", { name: "Effacer les filtres" }).click();
  await expect(search).toHaveValue("");
  await register.getByRole("combobox", { name: "Qualification" }).click();
  await page.getByRole("option", { name: "Hors scope" }).click();
  await expect(titles).toHaveText(["Page Équipe", "Section blog"]);
  await register.getByRole("combobox", { name: "Proposition" }).click();
  await page.getByRole("option", { name: "En attente du client" }).click();
  await expect(titles).toHaveText(["Section blog"]);

  // Nothing left: said so, the filters cleared in one click.
  await search.fill("introuvable");
  await expect(register).toContainText("Aucune demande ne correspond");
  await expect(register.getByRole("table")).toHaveCount(0);
  await register.getByRole("button", { name: "Effacer les filtres" }).click();
  await expect(titles).toHaveCount(4);
  expect(errors).toEqual([]);
});
