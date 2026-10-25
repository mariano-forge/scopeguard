// The client's review page reads the project's scope once active, and has its own bell: the agency's
// replies, the quotes to decide, their requests qualified, a newer version shared with them. Nothing
// more reaches them for it (src/db/reviewAccess.ts readReviewState): no draft scope, no budget, no log.

import { expect, test, type Browser } from "@playwright/test";
import { baseURL } from "../../playwright.config";
import { call, createAgency, newPerson, seedReview, seedState, signUp, unique, verifiedClient, type Member } from "./helpers";

const hour = 60 * 60 * 1000;
const saveScope = (member: Member, scope: unknown) => call("/api/projects/1/scope", { method: "PUT", person: member, body: { scope } });

/** A shared version with: a request of the client's, qualified and answered; a quote to decide; an accepted one; a newer version shared. */
async function review() {
  const alice = await signUp("Alice Martin");
  await createAgency(alice, "Studio Client");
  const token = unique("tok-notices");
  const { linkKey } = await seedReview(alice, token);
  const email = `${unique("claire")}@client.test`;
  const now = Date.now();
  const agency = { author: "Alice Martin", initials: "AM", from: "agency", location: "", time: "t" };
  await seedState(alice, {
    lists: {
      deliverables: { upsert: [{ id: 2, projectId: 1, name: "maquette-1.png", type: "Image", version: 2, status: "En attente client", locked: false, importedAt: "x" }], remove: [] },
      comments: {
        upsert: [
          {
            id: 20, deliverableId: 1, author: "Claire Dubois", initials: "CD", from: "client", kind: "request", message: "Le logo est trop petit", title: "Logo plus grand", decision: "Inclus", location: "", time: "t", createdAt: now - 3 * hour,
            replies: [{ id: 2001, ...agency, message: "C’est noté, on l’agrandit.", createdAt: now - hour }],
          },
          { id: 21, deliverableId: 1, ...agency, kind: "request", message: "Une page Équipe", title: "Page Équipe", decision: "Hors périmètre", createdAt: now - 2 * hour },
          { id: 22, deliverableId: 1, ...agency, kind: "request", message: "Une page Carrières", title: "Page Carrières", decision: "Hors périmètre", createdAt: now - 5 * hour },
          // The agency's own request, qualified too: not the client's, so no notice of it.
          { id: 23, deliverableId: 1, ...agency, kind: "request", message: "Bandeau cookies", title: "Bandeau cookies", decision: "Inclus", createdAt: now - 4 * hour },
        ],
        remove: [],
      },
      auditEvents: {
        upsert: [
          { id: (now - 30 * 60 * 1000) * 1000, type: "scope.classified", actor: "Alice Martin", description: "Mot interne du journal", timestamp: "x", commentId: 20, deliverableId: 1 },
          { id: (now - 4 * hour) * 1000, type: "scope.classified", actor: "Alice Martin", description: "Mot interne du journal", timestamp: "x", commentId: 23, deliverableId: 1 },
        ],
        remove: [],
      },
    },
    maps: {
      reviewLinks: { upsert: { "2:2": { token: unique("tok-v2"), active: true, expiresAt: "01/01/2099", autoExpire: true, deliverableId: 2, version: 2, invites: [{ email, at: "x", role: "decider" }] } }, remove: [] },
      proposalStates: { upsert: { "21": "sent", "22": "sent" }, remove: [] },
      proposalVersions: {
        upsert: {
          "21": [{ id: now - 2 * hour, commentId: 21, version: 1, amount: 900, deadline: 3, status: "sent", createdAt: "x", description: "Page Équipe" }],
          "22": [{ id: now - 5 * hour, commentId: 22, version: 1, amount: 600, deadline: 2, status: "accepted", createdAt: "x", description: "Page Carrières" }],
        },
        remove: [],
      },
      proposalDecisions: { upsert: { "22": "accepted" }, remove: [] },
    },
  });
  await call("/api/review-access/invite", { person: alice, body: { linkKey, emails: [email] } });
  const client = await verifiedClient(token, email, "Claire Dubois");
  return { alice, token, email, client };
}

async function openAsClient(browser: Browser, token: string, cookie: string) {
  const { page, errors } = await newPerson(browser);
  const [name, value] = cookie.split(";")[0].split("=");
  await page.context().addCookies([{ name, value, url: baseURL }]);
  await page.goto(`/review/${token}`);
  await expect(page.getByRole("complementary", { name: "Vos retours" })).toBeVisible();
  return { page, errors };
}

test("the client reads the scope once active, reduced to what is included and not; never a draft, a budget or the log", async () => {
  const { alice, token, client } = await review();
  const seen = async () => JSON.stringify((await call(`/api/review/${token}`, { person: client })).json);

  // A draft: not the reference yet, never sent.
  expect((await saveScope(alice, { budget: 12000, lines: [{ id: 1, title: "Ligne du brouillon" }], exclusions: [{ id: 2, title: "Rédaction des textes" }] })).status).toBe(200);
  expect(await seen()).not.toContain("Ligne du brouillon");
  // Active: what is included and not, and when it was agreed; no budget, no documents, no name of the agency's.
  expect((await call("/api/projects/1/scope/activation", { method: "POST", person: alice })).status).toBe(200);
  const state = (await call(`/api/review/${token}`, { person: client })).json.state as { projects: { scope?: Record<string, unknown> }[]; comments: { id: number; qualifiedAt?: number }[] };
  expect(state.projects[0]!.scope).toEqual({ lines: [{ id: 1, title: "Ligne du brouillon" }], exclusions: [{ id: 2, title: "Rédaction des textes" }], activatedAt: expect.any(Number) });
  expect(await seen()).not.toContain("12000");
  expect(await seen()).not.toContain("activatedBy");
  // The qualification's time, on the client's own request only; never the log's words.
  expect(state.comments.find((comment) => comment.id === 20)?.qualifiedAt).toEqual(expect.any(Number));
  expect(state.comments.find((comment) => comment.id === 23)?.qualifiedAt).toBeUndefined();
  expect(await seen()).not.toContain("Mot interne du journal");
  // Back to a draft: gone from the client's page again.
  expect((await call("/api/projects/1/scope/activation", { method: "DELETE", person: alice })).status).toBe(200);
  expect(await seen()).not.toContain("Ligne du brouillon");
});

test("the client's bell: the agency's reply, the quote to decide, their request qualified, a newer version; seen once closed", async ({ browser }) => {
  const { token, client } = await review();
  const { page, errors } = await openAsClient(browser, token, client.cookie);
  const panel = page.getByRole("complementary", { name: "Vos retours" });

  const bell = panel.getByRole("button", { name: /^Notifications/ });
  await expect(bell).toHaveAccessibleName("Notifications (4 non lues)");
  await bell.click();
  const list = page.getByRole("dialog", { name: "Notifications" });
  // The newest first (a newer version, undated, on top), each with what it is about.
  await expect(list.getByRole("listitem")).toContainText([
    "La V02 vous a été partagéeOuvrir la nouvelle version",
    "Demande qualifiée : Inclusil y a 30 minLogo plus grand",
    "Réponse de l’organisationil y a 1 h« C’est noté, on l’agrandit. » · Logo plus grand",
    "Devis à valideril y a 2 hPage Équipe · 900 € HT",
  ]);
  // Opening one: the quote, to decide; everything shown is then seen.
  await list.getByRole("button", { name: /Devis à valider/ }).click();
  const quote = page.getByRole("dialog", { name: "Proposition · demande n°21" });
  await expect(quote).toBeVisible();
  // The bell's list closed, the focus stays in the quote (not back on the bell, whose hint would take Escape).
  await expect(list).toBeHidden();
  await expect.poll(() => quote.evaluate((node) => node.contains(document.activeElement))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(quote).toBeHidden();
  await expect(bell).toHaveAccessibleName("Notifications");
  await bell.click();
  await expect(page.getByRole("dialog", { name: "Notifications" })).toContainText("Rien de nouveau.");
  expect(errors).toEqual([]);
});

test("from the review page, the client opens the project's scope once active: included, not included, the amendments", async ({ browser }) => {
  const { alice, token, client } = await review();
  expect((await saveScope(alice, { lines: [{ id: 1, title: "Pages intérieures", quantity: 5, unit: "pages" }], exclusions: [{ id: 2, title: "Rédaction des textes" }] })).status).toBe(200);
  const { page, errors } = await openAsClient(browser, token, client.cookie);
  const panel = page.getByRole("complementary", { name: "Vos retours" });
  // A draft: no scope to open.
  await expect(panel.getByRole("button", { name: "Périmètre du projet" })).toHaveCount(0);

  expect((await call("/api/projects/1/scope/activation", { method: "POST", person: alice })).status).toBe(200);
  await expect(panel.getByRole("button", { name: "Périmètre du projet" })).toBeVisible();
  await panel.getByRole("button", { name: "Périmètre du projet" }).click();
  const dialog = page.getByRole("dialog", { name: "Périmètre du projet" });
  await expect(dialog.getByRole("region", { name: "Prévu au devis", exact: true })).toContainText("Pages intérieures");
  await expect(dialog.getByRole("region", { name: "Prévu au devis", exact: true })).toContainText("5 pages");
  await expect(dialog.getByRole("region", { name: "Exclu du devis", exact: true })).toContainText("Rédaction des textes");
  // The amendments: the quotes this client accepted on the version, with what they add.
  await expect(dialog.getByRole("region", { name: "Avenants" })).toContainText("Page Carrières");
  await expect(dialog.getByRole("region", { name: "Avenants" })).toContainText("+600 € · +2 j");
  await expect(dialog.getByRole("region", { name: "Avenants" })).not.toContainText("Page Équipe");
  expect(errors).toEqual([]);
});
