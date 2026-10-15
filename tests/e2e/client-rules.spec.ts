// What a verified client may write through their link, checked by the server (src/db/reviewAccess.ts).

import { expect, test } from "@playwright/test";
import { call, createAgency, patchReview, patchState, seedReview, signUp, sql, unique, verifiedClient } from "./helpers";

async function reviewWithQuote() {
  const alice = await signUp("Alice Martin");
  await createAgency(alice, "Studio Règles");
  const token = unique("tok-rules");
  const { linkKey } = await seedReview(alice, token, { deliverableId: 1, version: 3 });
  await patchState(alice, {
    lists: {
      deliverables: { upsert: [{ id: 2, projectId: 1, name: "secret.pdf", version: 1 }], remove: [] },
      comments: {
        upsert: [
          { id: 10, deliverableId: 1, author: "Alice Martin", initials: "AM", from: "agency", message: "Section témoignages", decision: "Hors périmètre", kind: "request", title: "Témoignages", location: "", time: "t" },
          { id: 20, deliverableId: 2, author: "Alice Martin", initials: "AM", from: "agency", message: "Note interne", decision: "Inclus", kind: "request", location: "", time: "t" },
        ],
        remove: [],
      },
    },
    maps: {
      proposalStates: { upsert: { "10": "sent", "20": "sent" }, remove: [] },
      proposalVersions: { upsert: { "10": [{ id: 100, version: 1, commentId: 10, description: "Témoignages", amount: 900, deadline: 3, status: "sent", createdAt: "x" }] }, remove: [] },
    },
  });
  const email = `${unique("claire")}@client.test`;
  await call("/api/review-access/invite", { person: alice, body: { linkKey, emails: [email] } });
  const client = await verifiedClient(token, email, "Claire Dubois");
  return { org: alice.organizationId!, token, client, email };
}

/** Every query is limited to the test's agency: other tests' agencies use the same ids. */
const comment = async (org: string, id: number) =>
  (await sql<{ data: Record<string, unknown> }>("select data from comments where organization_id = $1 and id = $2", [org, id]))[0]?.data;

test("the client only sees the shared version", async () => {
  const { token, client } = await reviewWithQuote();
  const state = (await call(`/api/review/${token}`, { person: client })).json.state as Record<string, { name?: string; id?: number }[]>;
  expect(state.deliverables.map((deliverable) => deliverable.name)).toEqual(["maquette-1.png"]);
  expect(state.comments.map((entry) => entry.id)).toEqual([10]);
  expect(JSON.stringify(state)).not.toContain("secret");
});

test("the client cannot requalify, rewrite the agency, reach another version, create links or change quotes", async () => {
  const { org, token, client } = await reviewWithQuote();
  const original = await comment(org, 10);
  await patchReview(client, token, { lists: { comments: { upsert: [{ ...original, decision: "Inclus" }], remove: [] } } });
  await patchReview(client, token, { lists: { comments: { upsert: [{ ...original, message: "Rien à payer" }], remove: [] } } });
  await patchReview(client, token, { lists: { comments: { upsert: [{ ...original, from: "client" }], remove: [] } } });
  await patchReview(client, token, { lists: { comments: { upsert: [], remove: [10] } } });
  await patchReview(client, token, { lists: { comments: { upsert: [{ id: 20, deliverableId: 1, from: "client", initials: "CD", decision: "À qualifier", kind: "remark", message: "pwned" }], remove: [] } } });
  await patchReview(client, token, { lists: { clients: { upsert: [{ id: 9, name: "Pirate" }], remove: [] } }, maps: { reviewLinks: { upsert: { "2:1": { token: "steal", active: true, deliverableId: 2, version: 1 } }, remove: [] } } });
  await patchReview(client, token, { maps: { proposalVersions: { upsert: { "10": [{ id: 100, amount: 1, status: "accepted" }] }, remove: [] } } });
  await patchReview(client, token, { maps: { proposalDecisions: { upsert: { "20": "accepted" }, remove: [] } } });

  expect(await comment(org, 10)).toMatchObject({ decision: "Hors périmètre", message: "Section témoignages", from: "agency" });
  expect((await comment(org, 20)).message).toBe("Note interne");
  expect((await sql("select 1 from review_links where token = 'steal'")).length).toBe(0);
  expect((await sql("select 1 from clients where organization_id = $1 and name = 'Pirate'", [org])).length).toBe(0);
  const [quote] = await sql<{ data: { amount: number }; status: string }>("select data, status from proposal_versions where organization_id = $1 and id = 100", [org]);
  expect(quote).toMatchObject({ status: "sent", data: { amount: 900 } });
  const decisions = await sql<{ decision: string | null }>("select decision from comment_proposals where organization_id = $1 and comment_id = 20", [org]);
  expect(decisions.every((row) => row.decision === null)).toBe(true);
});

test("the client's remarks are signed by the server; they decide a quote once and approve, which locks the version", async () => {
  const { org, token, client, email } = await reviewWithQuote();
  await patchReview(client, token, {
    lists: { comments: { upsert: [{ id: 555, deliverableId: 1, author: "Faux nom", initials: "ZZ", from: "client", message: "Le logo est trop petit", location: "Page 1", decision: "À qualifier", kind: "remark", time: "t" }], remove: [] } },
  });
  expect(await comment(org, 555)).toMatchObject({ author: "Claire Dubois", initials: "CD", from: "client", authorEmail: email });

  await patchReview(client, token, { maps: { proposalDecisions: { upsert: { "10": "accepted" }, remove: [] }, proposalVersions: { upsert: { "10": [{ id: 100, status: "accepted" }] }, remove: [] } } });
  await patchReview(client, token, { maps: { proposalDecisions: { upsert: { "10": "refused" }, remove: [] } } });
  expect((await sql<{ decision: string }>("select decision from comment_proposals where organization_id = $1 and comment_id = 10", [org]))[0].decision).toBe("accepted");

  await patchReview(client, token, { lists: { deliverables: { upsert: [{ id: 1, version: 3, reviewStatus: "approved", approvedAt: "x", name: "renommé" }], remove: [] } } });
  const [version] = await sql<{ review_status: string; locked: boolean; name: string }>("select review_status, locked, name from deliverables where organization_id = $1 and id = 1", [org]);
  expect(version).toMatchObject({ review_status: "approved", locked: true, name: "maquette-1.png" });

  await patchReview(client, token, { lists: { comments: { upsert: [{ id: 556, deliverableId: 1, from: "client", initials: "CD", message: "après coup", decision: "À qualifier", kind: "remark" }], remove: [] } } });
  expect(await comment(org, 556)).toBeUndefined();
});

test("the audit trail cannot be changed, even directly in the database", async () => {
  const { org, token, client } = await reviewWithQuote();
  await patchReview(client, token, { lists: { comments: { upsert: [{ id: 557, deliverableId: 1, from: "client", initials: "CD", message: "Une remarque", decision: "À qualifier", kind: "remark", time: "t" }], remove: [] } } });
  const [event] = await sql<{ id: string }>("select id from audit_events where organization_id = $1 and comment_id = 557", [org]);
  expect(event).toBeDefined();
  await expect(sql("delete from audit_events where organization_id = $1 and id = $2", [org, event.id])).rejects.toThrow(/append-only/);
  await expect(sql("update audit_events set actor = 'x' where organization_id = $1 and id = $2", [org, event.id])).rejects.toThrow(/append-only/);
});
