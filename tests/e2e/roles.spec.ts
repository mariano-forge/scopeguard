// Members produce; administrators make the commercial and irreversible decisions (src/db/agencyPermissions.ts).

import { expect, test } from "@playwright/test";
import { addColleague, call, createAgency, newPerson, patchState, signInPage, signUp, unique } from "./helpers";

const quote = (id: number, commentId: number, status: string) => ({ id, version: 1, commentId, description: "Témoignages", amount: 900, deadline: 3, status, createdAt: "x" });

async function agencyWithWork() {
  const owner = await signUp("Alice Martin");
  await createAgency(owner, "Studio Rôles");
  const member = await addColleague(owner, "Mia Laurent", "member");
  const link = { token: unique("tok-roles"), active: true, expiresAt: "01/01/2099", deliverableId: 1, version: 1 };
  const now = Date.now();
  await patchState(owner, {
    lists: {
      clients: { upsert: [{ id: 1, name: "Northwind" }, { id: 7, name: "Contoso" }], remove: [] },
      projects: { upsert: [{ id: 1, name: "Refonte", clientId: 1 }, { id: 2, name: "Ancien", clientId: 1 }], remove: [] },
      deliverables: { upsert: [{ id: 1, projectId: 1, name: "a.pdf", version: 1 }, { id: 2, projectId: 1, name: "b.pdf", version: 1 }], remove: [] },
      comments: {
        upsert: [
          { id: 10, deliverableId: 1, decision: "Hors périmètre", kind: "request" },
          { id: 11, deliverableId: 1, decision: "Hors périmètre", kind: "request" },
          { id: 12, deliverableId: 1, decision: "À qualifier", kind: "remark" },
        ],
        remove: [],
      },
      trash: {
        upsert: [
          { id: 500, kind: "livrable", name: "vieux.pdf", deletedAt: now, data: { clients: [], projects: [], deliverables: [{ id: 3, projectId: 1, name: "vieux.pdf", version: 1 }], comments: [] } },
          { id: 501, kind: "livrable", name: "autre.pdf", deletedAt: now, data: { clients: [], projects: [], deliverables: [{ id: 4, projectId: 1, name: "autre.pdf", version: 1 }], comments: [] } },
        ],
        remove: [],
      },
    },
    maps: {
      proposalStates: { upsert: { "10": "draft", "11": "sent" }, remove: [] },
      proposalVersions: { upsert: { "10": [quote(100, 10, "draft")], "11": [quote(110, 11, "sent")] }, remove: [] },
      adaptationRequests: { upsert: { "11": { message: "Moins cher ?", budget: 600, requestedAt: "x" } }, remove: [] },
      reviewLinks: { upsert: { "1:1": link }, remove: [] },
    },
  });
  return { owner, member, link };
}

test("a member is refused every reserved action, with a message naming it", async () => {
  const { member, link } = await agencyWithWork();
  const refused = async (partial: Record<string, unknown>) => {
    const answer = await patchState(member, partial);
    expect(answer.status).toBe(403);
    return answer.json.error;
  };
  expect(await refused({ maps: { proposalStates: { upsert: { "10": "sent" }, remove: [] }, proposalVersions: { upsert: { "10": [quote(100, 10, "sent")] }, remove: [] } } })).toContain("envoyer un devis");
  expect(await refused({ maps: { adaptationRequests: { upsert: { "11": { message: "Moins cher ?", budget: 600, requestedAt: "x", decision: "accepted" } }, remove: [] } } })).toContain("contre-proposition");
  expect(await refused({ maps: { adaptationRequests: { upsert: {}, remove: ["11"] } } })).toContain("contre-proposition");
  expect(await refused({ maps: { reviewLinks: { upsert: { "1:1": { ...link, active: false } }, remove: [] } } })).toContain("révoquer un lien client");
  expect(await refused({ lists: { clients: { upsert: [], remove: [1] } } })).toContain("supprimer un espace");
  expect(await refused({ lists: { projects: { upsert: [], remove: [2] } } })).toContain("supprimer un projet");
  expect(await refused({ lists: { trash: { upsert: [], remove: [500] } } })).toContain("supprimer définitivement");
});

test("a member still produces: qualify, draft a quote, restore, delete a deliverable", async () => {
  const { member } = await agencyWithWork();
  expect((await patchState(member, { lists: { comments: { upsert: [{ id: 12, deliverableId: 1, decision: "Inclus", kind: "request", title: "Logo" }], remove: [] } } })).status).toBe(200);
  expect((await patchState(member, { maps: { proposalStates: { upsert: { "12": "draft" }, remove: [] }, proposalVersions: { upsert: { "12": [quote(120, 12, "draft")] }, remove: [] } } })).status).toBe(200);
  expect((await patchState(member, { lists: { trash: { upsert: [], remove: [500] }, deliverables: { upsert: [{ id: 3, projectId: 1, name: "vieux.pdf", version: 1 }], remove: [] } } })).status).toBe(200);
  expect(
    (await patchState(member, { lists: { deliverables: { upsert: [], remove: [2] }, trash: { upsert: [{ id: 502, kind: "livrable", name: "b.pdf", deletedAt: Date.now(), data: { clients: [], projects: [], deliverables: [{ id: 2 }], comments: [] } }], remove: [] } } })).status,
  ).toBe(200);
});

test("owners and administrators make those decisions", async () => {
  const { owner, link } = await agencyWithWork();
  expect((await patchState(owner, { maps: { proposalStates: { upsert: { "10": "sent" }, remove: [] }, proposalVersions: { upsert: { "10": [quote(100, 10, "sent")] }, remove: [] } } })).status).toBe(200);
  expect((await patchState(owner, { maps: { reviewLinks: { upsert: { "1:1": { ...link, active: false } }, remove: [] } } })).status).toBe(200);
  expect((await patchState(owner, { lists: { trash: { upsert: [], remove: [500, 501] } } })).status).toBe(200);
  const admin = await addColleague(owner, "Adam Admin", "admin");
  expect((await patchState(admin, { lists: { clients: { upsert: [], remove: [7] } } })).status).toBe(200);
});

test("a member sees reserved actions greyed out, with the reason", async ({ browser }) => {
  const { member } = await agencyWithWork();
  const { page, errors } = await newPerson(browser);
  await signInPage(page, member.email);
  await page.goto("/corbeille");
  await expect(page.getByText("autre.pdf")).toBeVisible();
  await expect(page.getByRole("button", { name: /Vider la corbeille/ })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Restaurer" }).first()).toBeEnabled();
  await page.goto("/espaces/7");
  await page.getByRole("button", { name: "Réglages de l’espace" }).click();
  const remove = page.getByRole("menuitem", { name: /Supprimer l’espace/ });
  await expect(remove).toHaveAttribute("data-disabled", "");
  await expect(remove).toContainText("Réservé aux administrateurs de l’agence");
  expect(errors).toEqual([]);
  expect((await call("/api/state", { person: member })).status).toBe(200);
});
