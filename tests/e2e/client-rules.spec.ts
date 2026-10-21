// What a verified client may write through their link, checked by the server (src/db/reviewAccess.ts,
// src/db/reviewActions.ts). The client writes one action at a time; there is no generic write.

import { expect, test } from "@playwright/test";
import { call, changes, clientAction, createAgency, seedState, seedReview, signUp, sql, unique, verifiedClient } from "./helpers";

async function reviewWithQuote() {
  const alice = await signUp("Alice Martin");
  await createAgency(alice, "Studio Règles");
  const token = unique("tok-rules");
  const { linkKey } = await seedReview(alice, token, { deliverableId: 1, version: 3 });
  await seedState(alice, {
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
  return { alice, org: alice.organizationId!, token, client, email };
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
  // The former generic write is closed: whatever state the page sends, nothing is written.
  const generic = await call(`/api/review/${token}`, {
    method: "PATCH",
    person: client,
    body: { changes: changes({ lists: { clients: { upsert: [{ id: 9, name: "Pirate" }], remove: [] } }, maps: { reviewLinks: { upsert: { "2:1": { token: "steal", active: true, deliverableId: 2, version: 1 } }, remove: [] } } }) },
  });
  expect(generic.status).toBe(405);
  expect((await clientAction(client, token, "comments/10", "PATCH", { message: "Rien à payer" })).status).toBe(409);
  expect((await clientAction(client, token, "comments/10", "DELETE")).status).toBe(409);
  expect((await clientAction(client, token, "comments/20", "PATCH", { message: "pwned" })).status).toBe(404);
  expect((await clientAction(client, token, "comments/20/replies", "POST", { message: "pwned" })).status).toBe(404);
  // 20 belongs to another version: unknown to this link.
  expect((await clientAction(client, token, "proposals/20/decision", "POST", { decision: "accepted" })).status).toBe(404);

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
  const created = await clientAction(client, token, "comments", "POST", { id: 555, author: "Faux nom", initials: "ZZ", message: "Le logo est trop petit", location: "Page 1", name: "renommé" });
  expect(created.json.id).toBe(555);
  expect(await comment(org, 555)).toMatchObject({ author: "Claire Dubois", initials: "CD", from: "client", authorEmail: email });

  expect((await clientAction(client, token, "proposals/10/decision", "POST", { decision: "accepted" })).status).toBe(200);
  expect((await clientAction(client, token, "proposals/10/decision", "POST", { decision: "refused" })).status).toBe(409);
  expect((await sql<{ decision: string }>("select decision from comment_proposals where organization_id = $1 and comment_id = 10", [org]))[0].decision).toBe("accepted");

  expect((await clientAction(client, token, "approval", "POST", { name: "renommé", approvedAt: "x" })).status).toBe(200);
  const [version] = await sql<{ review_status: string; locked: boolean; name: string }>("select review_status, locked, name from deliverables where organization_id = $1 and id = 1", [org]);
  expect(version).toMatchObject({ review_status: "approved", locked: true, name: "maquette-1.png" });

  expect((await clientAction(client, token, "comments", "POST", { id: 556, message: "après coup" })).status).toBe(409);
  expect(await comment(org, 556)).toBeUndefined();
});

test("the audit trail cannot be changed, even directly in the database", async () => {
  const { org, token, client } = await reviewWithQuote();
  await clientAction(client, token, "comments", "POST", { id: 557, message: "Une remarque" });
  const [event] = await sql<{ id: string }>("select id from audit_events where organization_id = $1 and comment_id = 557", [org]);
  expect(event).toBeDefined();
  await expect(sql("delete from audit_events where organization_id = $1 and id = $2", [org, event.id])).rejects.toThrow(/append-only/);
  await expect(sql("update audit_events set actor = 'x' where organization_id = $1 and id = $2", [org, event.id])).rejects.toThrow(/append-only/);
});

test("a client never sees who else is invited, nor their personal links", async () => {
  const { token, client, email } = await reviewWithQuote();
  const [{ organization_id: org }] = await sql<{ organization_id: string }>("select organization_id from review_links where token = $1", [token]);
  const other = `${unique("autre")}@client.test`;
  await sql("update review_links set data = jsonb_set(data, '{invites}', data->'invites' || jsonb_build_array(jsonb_build_object('email', $2::text, 'at', 'x', 'id', 'lien-personnel-secret'))) where organization_id = $1 and token = $3", [org, other, token]);
  const linkKey = "1:3";
  const answer = await call(`/api/review/${token}`, { person: client });
  const link = (answer.json.state as { reviewLinks: Record<string, Record<string, unknown>> }).reviewLinks[linkKey];
  expect(link.token).toBe(token);
  expect(link.invites).toBeUndefined();
  expect(JSON.stringify(answer.json)).not.toContain(other);
  expect(JSON.stringify(answer.json)).not.toContain(email);
  expect(JSON.stringify(answer.json)).not.toContain("lien-personnel-secret");
  // Nor in an action's answer.
  const acted = await clientAction(client, token, "comments", "POST", { message: "Bonjour" });
  expect(JSON.stringify(acted.json)).not.toContain(other);
});

test("the client sees what is addressed to them: every qualified request, none of the agency's drafts, never a draft quote", async () => {
  const { alice, org, token, client } = await reviewWithQuote();
  const quote = (id: number, commentId: number, status: string, amount: number) => ({ id, version: 1, commentId, description: "Devis", amount, deadline: 2, status, createdAt: "x" });
  const request = (id: number, from: "agency" | "client", decision: string, title: string) => ({ id, deliverableId: 1, author: "x", initials: "XX", from, message: title, title, decision, kind: "request", location: "", time: "t" });
  await seedState(alice, {
    lists: {
      comments: {
        upsert: [
          request(30, "agency", "Inclus", "Titre plus lisible"),
          request(31, "agency", "Hors périmètre", "Section blog cachée"),
          request(32, "client", "Hors périmètre", "Ajout demandé par le client"),
          request(33, "agency", "Hors périmètre", "Carte interactive"),
          request(34, "agency", "À qualifier", "Quelle couleur ?"),
          { id: 35, deliverableId: 1, author: "Alice Martin", initials: "AM", from: "agency", message: "Repère de l’agence", decision: "À qualifier", kind: "remark", location: "Page 1", page: 1, position: { x: 40, y: 40 }, time: "t", replies: [{ id: 1, author: "Alice Martin", initials: "AM", from: "agency", message: "On le facture ?", time: "t" }] },
        ],
        remove: [],
      },
    },
    maps: {
      proposalStates: { upsert: { "31": "draft", "33": "draft" }, remove: [] },
      // 31: a draft never sent. 33: refused once, a new draft is being prepared.
      proposalVersions: { upsert: { "31": [quote(310, 31, "draft", 4321)], "33": [quote(330, 33, "refused", 1200), { ...quote(331, 33, "draft", 9876), version: 2 }] }, remove: [] },
    },
  });

  const answer = await call(`/api/review/${token}`, { person: client });
  const state = answer.json.state as { comments: { id: number }[]; proposalStates: Record<string, string>; proposalVersions: Record<string, { id: number }[]> };
  // 31: out of scope, its quote still a draft: shown as soon as qualified (« En cours de chiffrage »).
  // 34: « + Demande » with « À clarifier » chosen, shown. 35: a pin of the agency, no status chosen: its draft.
  expect(state.comments.map((comment) => comment.id).sort()).toEqual([10, 30, 31, 32, 33, 34]);
  // Of a draft quote, not even its existence: no state, no version.
  expect(state.proposalStates).toEqual({ "10": "sent" });
  expect(state.proposalVersions["31"] ?? []).toEqual([]);
  expect(state.proposalVersions["33"].map((entry) => entry.id)).toEqual([330]);
  const raw = JSON.stringify(answer.json);
  expect(raw).not.toContain("Repère de l’agence");
  // The draft amounts, as whole numbers: ids made from the clock may contain the same digits.
  for (const amount of [4321, 9876]) expect(raw).not.toMatch(new RegExp(String.raw`(?<!\d)${amount}(?!\d)`));
  expect((await clientAction(client, token, "comments/35/replies", "POST", { message: "Vu ?" })).status).toBe(404);
  // Once the agency chooses its status, even « À clarifier », the pin shows, under its title, its whole
  // thread with it: out of draft, nothing of it is internal any more (decided on 19 October 2026).
  expect((await call("/api/comments/35/qualification", { method: "PUT", person: alice, body: { decision: "À qualifier", title: "Taille du logo ?" } })).status).toBe(200);
  const after = (await call(`/api/review/${token}`, { person: client })).json.state as { comments: { id: number; title?: string }[] };
  expect(after.comments.find((entry) => entry.id === 35)).toMatchObject({ title: "Taille du logo ?", message: "Repère de l’agence", replies: [expect.objectContaining({ message: "On le facture ?" })] });
  expect((await call("/api/comments/35/replies", { method: "POST", person: alice, body: { message: "Pouvez-vous confirmer ?" } })).status).toBe(200);
  expect((await clientAction(client, token, "comments/35/replies", "POST", { message: "Plus grand" })).status).toBe(200);
  const thread = ((await call(`/api/review/${token}`, { person: client })).json.state as { comments: { id: number; replies: { message: string }[] }[] }).comments.find((entry) => entry.id === 35)!;
  expect(thread.replies.map((reply) => reply.message)).toEqual(["On le facture ?", "Pouvez-vous confirmer ?", "Plus grand"]);
  // The proof shows the same thread as the client.
  const proof = (await call("/api/proof/1", { person: alice })).json as { requests: { id: number; message: string }[] };
  expect(proof.requests.find((request) => request.id === 35)?.message).toBe("Repère de l’agence");

  // A draft of the agency cannot be reached through the API; a quote not sent cannot be decided.
  expect((await call("/api/comments", { method: "POST", person: alice, body: { deliverableId: 1, message: "Note brouillon", page: 1, position: { x: 10, y: 10 } } })).status).toBe(200);
  const [draft] = await sql<{ id: string }>("select id from comments where organization_id = $1 and data->>'message' = 'Note brouillon'", [org]);
  expect((await clientAction(client, token, `comments/${draft.id}/replies`, "POST", { message: "Je l’ai trouvée" })).status).toBe(404);
  expect((await clientAction(client, token, "proposals/31/decision", "POST", { decision: "accepted" })).status).toBeGreaterThanOrEqual(400);
  const decided = await sql<{ decision: string | null }>("select decision from comment_proposals where organization_id = $1 and comment_id = 31", [org]);
  expect(decided[0]?.decision ?? "none").toBe("none");
  // An action's answer carries the same filtered state.
  const replied = await clientAction(client, token, "comments/30/replies", "POST", { message: "Merci" });
  expect(replied.status).toBe(200);
  expect(JSON.stringify(replied.json)).not.toMatch(/(?<!\d)9876(?!\d)/);
  expect(JSON.stringify(replied.json)).not.toContain("Note brouillon");
  expect(await comment(org, 31)).toMatchObject({ title: "Section blog cachée" });
});
