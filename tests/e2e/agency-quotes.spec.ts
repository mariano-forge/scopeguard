// The agency's quote routes (/api/comments/:id/proposal…, src/db/agencyActions.ts): only in the
// right order, administrators only for what reaches the client, members for what stays a draft.

import { expect, test } from "@playwright/test";
import { addColleague, call, createAgency, seedState, signUp, sql, unique, type Person } from "./helpers";

const quote = (commentId: number, status: string) => ({ id: commentId * 10, version: 1, commentId, description: `Devis ${commentId}`, amount: 900, deadline: 3, status, createdAt: "x" });
const request = (id: number, decision = "Hors périmètre") => ({ id, deliverableId: 1, author: "Alice Martin", initials: "AM", from: "agency", message: `Demande ${id}`, title: `Demande ${id}`, decision, kind: "request", location: "", time: "t" });

async function agency() {
  const alice = await signUp("Alice Martin");
  await createAgency(alice, "Studio Devis API");
  await seedState(alice, {
    lists: {
      clients: { upsert: [{ id: 1, name: "Northwind" }], remove: [] },
      projects: { upsert: [{ id: 1, name: "Refonte", clientId: 1, client: "Northwind", status: "En cours" }], remove: [] },
      deliverables: { upsert: [{ id: 1, projectId: 1, name: "maquette.png", type: "Image", version: 1, status: "En attente client", locked: false }], remove: [] },
      comments: { upsert: [request(31), request(32), request(33), request(34), request(35, "Inclus"), request(36)], remove: [] },
    },
    maps: {
      reviewLinks: { upsert: { "1:1": link([{ email: `${unique("claire")}@northwind.test`, at: "14/10/2026 10:00", role: "decider" }]) }, remove: [] },
      proposalStates: { upsert: { "31": "draft", "32": "sent", "33": "sent", "34": "sent" }, remove: [] },
      proposalDecisions: { upsert: { "33": "refused", "34": "accepted" }, remove: [] },
      adaptationRequests: { upsert: { "32": { message: "Moins cher ?", budget: 600, requestedAt: "x" } }, remove: [] },
      proposalVersions: { upsert: { "31": [quote(31, "draft")], "32": [quote(32, "sent")], "33": [quote(33, "refused")], "34": [quote(34, "accepted")] }, remove: [] },
    },
  });
  const bob = await addColleague(alice, "Bob Membre", "member");
  const act = (person: Partial<Person>, path: string, body: Record<string, unknown> = {}) => call(`/api/comments/${path}`, { method: "POST", person, body });
  return { alice, bob, org: alice.organizationId!, act };
}

const proposal = async (org: string, id: number) =>
  (await sql<{ state: string | null; decision: string | null; adaptation: Record<string, unknown> | null }>("select state, decision, adaptation from comment_proposals where organization_id = $1 and comment_id = $2", [org, id]))[0];
/** The version's review link: a proposal goes to the deciders invited on it. */
const link = (invites: Record<string, unknown>[], extra: Record<string, unknown> = {}) => ({ token: unique("tok-devis-api"), active: true, expiresAt: "01/01/2099", autoExpire: true, deliverableId: 1, version: 1, invites, ...extra });

const statuses = async (org: string, id: number) =>
  (await sql<{ status: string }>("select status from proposal_versions where organization_id = $1 and comment_id = $2 order by position", [org, id])).map((row) => row.status);
const typed = { description: "Nouvelle offre", amount: 700, deadline: 2, allowCounter: true };

test("members may not send a quote nor answer a counter-proposal; administrators may", async () => {
  const { alice, bob, org, act } = await agency();
  for (const [path, body] of [
    ["31/proposal/send", {}],
    ["36/proposal", { description: "Offre", amount: 500, deadline: 1 }],
    ["32/adaptation/decision", { decision: "accepted" }],
    ["32/proposal/versions", { ...typed, send: true }],
  ] as const) {
    const refused = await act(bob, path, body);
    expect(refused.status, path).toBe(403);
    expect(refused.json.code).toBe("ADMIN_ONLY");
  }
  expect(await proposal(org, 31)).toMatchObject({ state: "draft" });
  expect(await statuses(org, 32)).toEqual(["sent"]);

  expect((await act(alice, "31/proposal/send")).status).toBe(200);
  expect(await proposal(org, 31)).toMatchObject({ state: "sent", decision: "none" });
  expect(await statuses(org, 31)).toEqual(["sent"]);
  expect((await act(alice, "36/proposal", { description: "Offre", amount: 500, deadline: 1 })).status).toBe(200);
  expect(await statuses(org, 36)).toEqual(["sent"]);

  expect((await act(alice, "32/adaptation/decision", { decision: "refused" })).status).toBe(200);
  expect((await proposal(org, 32)).adaptation).toMatchObject({ decision: "refused", decisionBy: "Alice Martin" });
  expect((await act(alice, "32/adaptation/decision", { decision: "accepted" })).status).toBe(409);
});

test("after a refusal, a member quotes again; the new quote waits for an administrator to send it", async () => {
  const { alice, bob, org, act } = await agency();
  expect((await act(bob, "33/proposal/versions", { ...typed, send: false })).status).toBe(200);
  expect(await statuses(org, 33)).toEqual(["refused", "draft"]);
  expect(await proposal(org, 33)).toMatchObject({ state: "draft", decision: "none" });
  expect((await act(bob, "33/proposal/send")).status).toBe(403);
  expect((await act(alice, "33/proposal/send")).status).toBe(200);
  expect(await statuses(org, 33)).toEqual(["refused", "sent"]);
  const types = (await sql<{ type: string }>("select type from audit_events where organization_id = $1 and comment_id = 33 order by id", [org])).map((row) => row.type);
  expect(types).toEqual(["proposal.drafted", "proposal.sent"]);
});

test("quotes follow their order: nothing out of turn, nothing on a request in scope", async () => {
  const { alice, org, act } = await agency();
  // Waiting for the client (32): no re-quote; accepted (34): no new version; nothing to send on 36.
  expect((await act(alice, "32/proposal/versions", { ...typed, send: false })).status).toBe(409);
  expect((await act(alice, "34/proposal/versions", { ...typed, send: true })).status).toBe(409);
  expect((await act(alice, "34/proposal/versions", { ...typed, send: false })).status).toBe(409);
  expect((await act(alice, "36/proposal/send")).status).toBe(409);
  expect((await act(alice, "32/proposal", { description: "Encore", amount: 1, deadline: 1 })).status).toBe(409);
  expect((await act(alice, "33/adaptation/decision", { decision: "accepted" })).status).toBe(409);
  expect((await act(alice, "35/proposal", { description: "Offre", amount: 1, deadline: 1 })).status).toBe(409);
  expect(await statuses(org, 34)).toEqual(["accepted"]);

  // A new version answers the pending counter-proposal: it goes, the earlier quote is replaced.
  expect((await act(alice, "32/proposal/versions", { ...typed, send: true })).status).toBe(200);
  expect(await statuses(org, 32)).toEqual(["superseded", "sent"]);
  expect((await proposal(org, 32)).adaptation).toBeNull();

  // Malformed, unknown, another agency's.
  expect((await act(alice, "32/proposal/versions", { ...typed, amount: -5, send: true })).status).toBe(400);
  expect((await act(alice, "32/adaptation/decision", { decision: "peut-être" })).status).toBe(400);
  expect((await act(alice, "999/proposal/send")).status).toBe(404);
  const mallory = await signUp("Mallory Autre");
  await createAgency(mallory, "Studio Intrus Devis");
  expect((await act(mallory, "31/proposal/send")).status).toBe(404);
});

test("a proposal is sent only to a decider: refused with no link, a contributor only, or a link turned off or expired", async () => {
  const { alice, org, act } = await agency();
  const contributor = { email: `${unique("lea")}@northwind.test`, at: "14/10/2026 10:00", role: "contributor" };
  const decider = { email: `${unique("claire")}@northwind.test`, at: "14/10/2026 10:00", role: "decider" };
  const sends = [
    ["31/proposal/send", {}],
    ["36/proposal", { description: "Offre", amount: 500, deadline: 1 }],
    ["32/proposal/versions", { ...typed, send: true }],
  ] as const;
  for (const reviewLink of [null, link([contributor]), link([decider], { active: false }), link([decider], { expiresAt: "01/01/2020" })]) {
    await seedState(alice, { maps: { reviewLinks: reviewLink ? { upsert: { "1:1": reviewLink }, remove: [] } : { upsert: {}, remove: ["1:1"] } } });
    for (const [path, body] of sends) {
      const refused = await act(alice, path, body);
      expect(refused.status, `${path} ${JSON.stringify(reviewLink?.invites ?? null)}`).toBe(409);
      expect(refused.json.error).toContain("Aucun décideur");
    }
  }
  expect(await proposal(org, 31)).toMatchObject({ state: "draft" });
  expect(await statuses(org, 32)).toEqual(["sent"]);
  expect(await sql("select 1 from comment_proposals where organization_id = $1 and comment_id = 36", [org])).toHaveLength(0);
  expect(await sql("select 1 from audit_events where organization_id = $1 and type = 'proposal.sent'", [org])).toHaveLength(0);
  // A draft after a refusal still waits without anyone to send it to.
  expect((await act(alice, "33/proposal/versions", { ...typed, send: false })).status).toBe(200);

  await seedState(alice, { maps: { reviewLinks: { upsert: { "1:1": link([contributor, decider]) }, remove: [] } } });
  expect((await act(alice, "31/proposal/send")).status).toBe(200);
});
