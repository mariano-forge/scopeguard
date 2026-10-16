// A version's client link and validation, through the agency's routes (/api/deliverables/…,
// src/db/agencyActions.ts): the server makes the token, administrators revoke, invitations go.

import { expect, test } from "@playwright/test";
import { addColleague, call, createAgency, seedState, signUp, sql, unique, type Person } from "./helpers";

async function agency() {
  const alice = await signUp("Alice Martin");
  await createAgency(alice, "Studio Liens API");
  await seedState(alice, {
    lists: {
      clients: { upsert: [{ id: 1, name: "Northwind" }], remove: [] },
      projects: { upsert: [{ id: 1, name: "Refonte", clientId: 1, client: "Northwind", status: "En cours" }], remove: [] },
      deliverables: { upsert: [{ id: 1, projectId: 1, name: "maquette.png", type: "Image", version: 2, status: "En attente client", locked: false }], remove: [] },
    },
  });
  const bob = await addColleague(alice, "Bob Membre", "member");
  const act = (person: Partial<Person>, path: string, method: "POST" | "DELETE", body?: Record<string, unknown>) => call(`/api/deliverables/${path}`, { method, person, body: body ?? (method === "DELETE" ? undefined : {}) });
  return { alice, bob, org: alice.organizationId!, act };
}

const link = async (org: string) =>
  (await sql<{ token: string; active: boolean; data: { invites?: { email: string }[] } }>("select token, active, data from review_links where organization_id = $1 and key = '1:2'", [org]))[0];

test("sharing makes one link per version with a server token; members share, only administrators revoke", async () => {
  const { alice, bob, org, act } = await agency();
  const shared = await act(bob, "1/review-link", "POST", { token: "choisi-par-la-page" });
  expect(shared.status).toBe(200);
  const token = (shared.json.link as { token: string }).token;
  expect(token).toMatch(/^[0-9a-f-]{36}$/);
  expect(await link(org)).toMatchObject({ token, active: true });
  // Sharing again keeps it.
  expect(((await act(alice, "1/review-link", "POST")).json.link as { token: string }).token).toBe(token);

  const refused = await act(bob, "1/review-link", "DELETE");
  expect(refused.status).toBe(403);
  expect(refused.json.code).toBe("ADMIN_ONLY");
  expect((await act(alice, "1/review-link", "DELETE")).status).toBe(200);
  expect((await link(org)).active).toBe(false);
  expect((await act(alice, "1/review-link", "DELETE")).status).toBe(409);
  expect((await call(`/api/review/${token}`)).status).toBe(404);

  // A revoked link is replaced by a new token.
  const renewed = ((await act(bob, "1/review-link", "POST")).json.link as { token: string }).token;
  expect(renewed).not.toBe(token);
  const types = (await sql<{ type: string }>("select type from audit_events where organization_id = $1 and deliverable_id = 1 order by id", [org])).map((row) => row.type);
  expect(types).toEqual(["review-link.revoked"]);
});

test("removing an invitation cuts that address only; reopening keeps the reason", async () => {
  const { alice, org, act } = await agency();
  await act(alice, "1/review-link", "POST");
  const [kept, removed] = [`${unique("garde")}@client.test`, `${unique("retire")}@client.test`];
  expect((await call("/api/review-access/invite", { person: alice, body: { linkKey: "1:2", emails: [kept, removed] } })).status).toBe(200);
  const gone = await act(alice, `1/review-link/invites/${encodeURIComponent(removed)}`, "DELETE");
  expect(gone.status, JSON.stringify(gone.json)).toBe(200);
  expect((await link(org)).data.invites?.map((invite) => invite.email)).toEqual([kept]);
  expect((await act(alice, `1/review-link/invites/${encodeURIComponent(removed)}`, "DELETE")).status).toBe(404);

  expect((await act(alice, "1/reopen", "POST", { message: "" })).status).toBe(400);
  expect((await act(alice, "1/reopen", "POST", { message: "Revoir le titre" })).status).toBe(200);
  expect((await sql<{ review_status: string }>("select review_status from deliverables where organization_id = $1 and id = 1", [org]))[0].review_status).toBe("changes-requested");
});

test("only the client approves a version: the agency, even its owner, has no way to", async () => {
  const { alice, org, act } = await agency();
  // No such route: the address falls to the app's pages (HTML), nothing is written.
  const approval = await act(alice, "1/approval", "POST");
  expect(approval.response.headers.get("content-type")).not.toContain("application/json");
  expect((await call("/api/deliverables/1", { method: "PATCH", person: alice, body: { name: "maquette.png", reviewStatus: "approved", status: "Approuvée", locked: true } })).status).toBe(200);
  expect((await call("/api/state", { method: "PATCH", person: alice, body: { changes: { lists: { deliverables: { upsert: [{ id: 1, reviewStatus: "approved" }], remove: [] } }, maps: {}, settings: { upsert: {}, remove: [] } } } })).status).toBe(405);
  const [version] = await sql<{ review_status: string | null; locked: boolean; status: string }>("select review_status, locked, data->>'status' as status from deliverables where organization_id = $1 and id = 1", [org]);
  expect(version).toEqual({ review_status: null, locked: false, status: "En attente client" });
});

test("another agency's versions are out of reach", async () => {
  const { act } = await agency();
  const mallory = await signUp("Mallory Autre");
  await createAgency(mallory, "Studio Intrus Liens");
  expect((await act(mallory, "1/review-link", "POST")).status).toBe(404);
  expect((await act(mallory, "1/review-link", "DELETE")).status).toBe(404);
  expect((await act(mallory, "1/reopen", "POST", { message: "x" })).status).toBe(404);
  expect((await act({ cookie: "", ip: "198.51.200.5" }, "1/review-link", "POST")).status).toBe(401);
});
