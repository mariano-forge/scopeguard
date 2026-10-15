// Members produce; administrators make the commercial and irreversible decisions (src/db/agencyPermissions.ts).

import { expect, test } from "@playwright/test";
import { addColleague, call, createAgency, newPerson, seedState, signInPage, signUp, unique, type Member } from "./helpers";

const quote = (id: number, commentId: number, status: string) => ({ id, version: 1, commentId, description: "Témoignages", amount: 900, deadline: 3, status, createdAt: "x" });

async function agencyWithWork() {
  const owner = await signUp("Alice Martin");
  await createAgency(owner, "Studio Rôles");
  const member = await addColleague(owner, "Mia Laurent", "member");
  const link = { token: unique("tok-roles"), active: true, expiresAt: "01/01/2099", deliverableId: 1, version: 1 };
  const now = Date.now();
  await seedState(owner, {
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

/** One action of the agency, through its route (src/db/agencyActions.ts, workspaceActions.ts). */
const act = (person: Member, path: string, method: "POST" | "PUT" | "PATCH" | "DELETE", body?: Record<string, unknown>) =>
  call(`/api/${path}`, { method, person, body: body ?? (method === "DELETE" ? undefined : {}) });

test("a member is refused every reserved action, with a message naming it", async () => {
  const { member } = await agencyWithWork();
  const refused = async (path: string, method: "POST" | "DELETE", body?: Record<string, unknown>) => {
    const answer = await act(member, path, method, body);
    expect(answer.status, path).toBe(403);
    expect(answer.json.code).toBe("ADMIN_ONLY");
    return answer.json.error;
  };
  expect(await refused("comments/10/proposal/send", "POST")).toContain("envoyer un devis");
  expect(await refused("comments/11/adaptation/decision", "POST", { decision: "accepted" })).toContain("contre-proposition");
  expect(await refused("comments/11/proposal/versions", "POST", { description: "Autre", amount: 500, deadline: 2, send: true })).toContain("contre-proposition");
  expect(await refused("deliverables/1/review-link", "DELETE")).toContain("révoquer un lien client");
  expect(await refused("spaces/1", "DELETE")).toContain("supprimer un espace");
  expect(await refused("projects/2", "DELETE")).toContain("supprimer un projet");
  expect(await refused("trash/500", "DELETE")).toContain("supprimer définitivement");
  expect(await refused("trash", "DELETE")).toContain("supprimer définitivement");
});

test("a member still produces: qualify, draft a quote, restore, delete a deliverable", async () => {
  const { member } = await agencyWithWork();
  expect((await act(member, "comments/12/qualification", "PUT", { decision: "Inclus", title: "Logo" })).status).toBe(200);
  expect((await act(member, "comments/12/qualification", "PUT", { decision: "Hors périmètre", title: "Logo", quote: { amount: 900, days: 3 } })).status).toBe(200);
  expect((await act(member, "trash/500/restore", "POST")).status).toBe(200);
  expect((await act(member, "deliverables/2", "DELETE")).status).toBe(200);
});

test("owners and administrators make those decisions", async () => {
  const { owner } = await agencyWithWork();
  expect((await act(owner, "comments/10/proposal/send", "POST")).status).toBe(200);
  expect((await act(owner, "deliverables/1/review-link", "DELETE")).status).toBe(200);
  expect((await act(owner, "trash", "DELETE")).status).toBe(200);
  const admin = await addColleague(owner, "Adam Admin", "admin");
  expect((await act(admin, "spaces/7", "DELETE")).status).toBe(200);
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
