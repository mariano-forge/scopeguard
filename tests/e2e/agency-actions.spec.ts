// The agency's action routes on comments (/api/comments, src/db/agencyActions.ts): built from the
// stored records, signed with the member, limited to their agency and to versions still open.

import { expect, test } from "@playwright/test";
import { baseURL } from "../../playwright.config";
import { addColleague, call, createAgency, patchState, signUp, sql, type Person } from "./helpers";

async function agency() {
  const alice = await signUp("Alice Martin");
  await createAgency(alice, "Studio Actions Agence");
  await patchState(alice, {
    lists: {
      clients: { upsert: [{ id: 1, name: "Northwind" }], remove: [] },
      projects: { upsert: [{ id: 1, name: "Refonte", clientId: 1, client: "Northwind", status: "En cours" }], remove: [] },
      deliverables: {
        upsert: [
          { id: 1, projectId: 1, name: "maquette.png", type: "Image", version: 1, status: "En attente client", locked: false },
          { id: 2, projectId: 1, name: "ancienne.png", type: "Image", version: 1, status: "Approuvée", locked: true, reviewStatus: "approved" },
        ],
        remove: [],
      },
      comments: {
        upsert: [
          { id: 30, deliverableId: 1, author: "Claire Dubois", initials: "CD", from: "client", message: "Avis client", decision: "À qualifier", kind: "remark", location: "", time: "t", position: { x: 10, y: 10 }, replies: [{ id: 1, from: "client", message: "Précision client" }] },
          { id: 31, deliverableId: 1, author: "Alice Martin", initials: "AM", from: "agency", message: "Témoignages", decision: "Hors périmètre", kind: "request", title: "Témoignages", location: "", time: "t" },
          { id: 40, deliverableId: 2, author: "Alice Martin", initials: "AM", from: "agency", message: "Sur la version validée", decision: "À qualifier", kind: "remark", location: "", time: "t" },
        ],
        remove: [],
      },
    },
    maps: {
      proposalStates: { upsert: { "31": "sent" }, remove: [] },
      proposalDecisions: { upsert: { "31": "accepted" }, remove: [] },
    },
  });
  const act = (person: Partial<Person>, path: string, method: "POST" | "PUT" | "PATCH" | "DELETE", body?: Record<string, unknown>) => call(`/api/${path}`, { method, person, body: body ?? (method === "DELETE" ? undefined : {}) });
  return { alice, org: alice.organizationId!, act };
}

const commentData = async (org: string, id: number) =>
  (await sql<{ data: Record<string, unknown> }>("select data from comments where organization_id = $1 and id = $2", [org, id]))[0]?.data;

test("comments and replies are signed by the server; the agency changes only its own messages", async () => {
  const { alice, org, act } = await agency();
  const created = await act(alice, "comments", "POST", { deliverableId: 1, message: " Logo ", author: "Faux", from: "client", decision: "Inclus", id: 30 });
  expect(created.status).toBe(200);
  const id = created.json.id as number;
  expect(id).not.toBe(30);
  expect(await commentData(org, id)).toMatchObject({ message: "Logo", author: "Alice Martin", initials: "AM", from: "agency", decision: "À qualifier", kind: "remark" });
  expect(await commentData(org, 30)).toMatchObject({ message: "Avis client" });

  const reply = await act(alice, "comments/30/replies", "POST", { message: "Bien noté", author: "Faux" });
  expect(reply.status).toBe(200);
  expect(((await commentData(org, 30)).replies as Record<string, unknown>[]).at(-1)).toMatchObject({ id: reply.json.id, message: "Bien noté", author: "Alice Martin", from: "agency" });

  // The client's words stay theirs.
  expect((await act(alice, "comments/30", "PATCH", { message: "réécrit" })).status).toBe(409);
  expect((await act(alice, "comments/30/replies/1", "PATCH", { message: "réécrit" })).status).toBe(409);
  expect((await act(alice, "comments/30/replies/1", "DELETE")).status).toBe(409);
  expect((await act(alice, "comments/30", "DELETE")).status).toBe(409);
  expect(await commentData(org, 30)).toMatchObject({ message: "Avis client", replies: [{ id: 1, message: "Précision client" }, expect.anything()] });

  // Its own: edited, moved (any pin may be moved), deleted, restored under its id.
  expect((await act(alice, `comments/${id}`, "PATCH", { message: "Logo plus grand" })).status).toBe(200);
  expect((await act(alice, "comments/30", "PATCH", { page: 2, x: 20, y: 30 })).status).toBe(200);
  expect(await commentData(org, 30)).toMatchObject({ page: 2, position: { x: 20, y: 30 } });
  const before = await commentData(org, id);
  expect((await act(alice, `comments/${id}`, "DELETE")).status).toBe(200);
  expect(await commentData(org, id)).toBeUndefined();
  expect((await act(alice, "comments", "POST", { restore: before })).status).toBe(200);
  expect(await commentData(org, id)).toMatchObject({ message: "Logo plus grand", edited: true });
  expect((await act(alice, "comments", "POST", { restore: before })).status).toBe(409);
  expect((await act(alice, "comments", "POST", { restore: { ...before, id: id + 1, from: "client" } })).status).toBe(409);

  // Malformed.
  expect((await act(alice, "comments", "POST", { deliverableId: 1, message: "  " })).status).toBe(400);
  expect((await act(alice, "comments/30/qualification", "PUT", { decision: "Inclus" })).status).toBe(400);
  expect((await act(alice, "comments/abc", "DELETE")).status).toBe(400);
  expect((await act(alice, "comments/999", "PATCH", { message: "x" })).status).toBe(404);
});

test("approved versions and settled requests are frozen", async () => {
  const { alice, org, act } = await agency();
  expect((await act(alice, "comments", "POST", { deliverableId: 2, message: "Trop tard" })).status).toBe(409);
  expect((await act(alice, "comments/40/replies", "POST", { message: "Trop tard" })).status).toBe(409);
  expect((await act(alice, "comments/40", "PATCH", { message: "Trop tard" })).status).toBe(409);
  expect((await act(alice, "comments/40/qualification", "PUT", { decision: "Inclus", title: "x" })).status).toBe(409);
  expect((await act(alice, "comments", "POST", { deliverableId: 99, message: "Ailleurs" })).status).toBe(404);
  // The client accepted request 31's quote.
  expect((await act(alice, "comments/31/qualification", "PUT", { decision: "Inclus", title: "Autre" })).status).toBe(409);
  expect((await act(alice, "comments/31/replies", "POST", { message: "Encore" })).status).toBe(409);
  expect((await act(alice, "comments/31", "DELETE")).status).toBe(409);
  expect(await commentData(org, 31)).toMatchObject({ decision: "Hors périmètre", title: "Témoignages" });
});

test("qualifying: a member qualifies and drafts a quote, never over a sent one; each step is in the trail", async () => {
  const { alice, org, act } = await agency();
  const bob = await addColleague(alice, "Bob Membre", "member");
  expect((await act(bob, "comments/30/qualification", "PUT", { decision: "Hors périmètre", title: "Avis", quote: { amount: 400, days: 2, counter: true } })).status).toBe(200);
  expect(await commentData(org, 30)).toMatchObject({ decision: "Hors périmètre", kind: "request", title: "Avis", from: "client" });
  const [draft] = await sql<{ status: string; data: Record<string, unknown> }>("select status, data from proposal_versions where organization_id = $1 and comment_id = 30", [org]);
  expect(draft).toMatchObject({ status: "draft", data: { amount: 400, deadline: 2, allowCounter: true } });
  const types = (await sql<{ type: string; recorded_by: string }>("select type, recorded_by from audit_events where organization_id = $1 and comment_id = 30 order by id", [org])).map((row) => row.type);
  expect(types).toEqual(["scope.classified", "proposal.drafted"]);

  // A new draft replaces the earlier one.
  await act(bob, "comments/30/qualification", "PUT", { decision: "Hors périmètre", title: "Avis", quote: { amount: 500, days: 2, counter: false } });
  const drafts = await sql<{ data: { amount: number } }>("select data from proposal_versions where organization_id = $1 and comment_id = 30", [org]);
  expect(drafts.map((row) => row.data.amount)).toEqual([500]);

  // Sent quotes are not replaced by a draft; back to clarify.
  await sql("update comment_proposals set state = 'sent' where organization_id = $1 and comment_id = 30", [org]);
  await act(alice, "comments/30/qualification", "PUT", { decision: "Hors périmètre", title: "Avis", quote: { amount: 1, days: 1, counter: false } });
  expect((await sql<{ data: { amount: number } }>("select data from proposal_versions where organization_id = $1 and comment_id = 30", [org])).map((row) => row.data.amount)).toEqual([500]);
  expect((await act(alice, "comments/30/qualification", "PUT", { decision: "À qualifier" })).status).toBe(200);
  expect(await commentData(org, 30)).toMatchObject({ decision: "À qualifier", kind: "remark" });

  // A request created already qualified, with its draft.
  const request = await act(bob, "comments", "POST", { request: { deliverableId: 1, decision: "Hors périmètre", title: "Blog", description: "Trois articles", quote: { amount: 900, days: 5, counter: true } } });
  expect(request.status).toBe(200);
  expect(await commentData(org, request.json.id as number)).toMatchObject({ title: "Blog", description: "Trois articles", decision: "Hors périmètre", kind: "request", author: "Bob Membre", from: "agency" });
});

test("only the agency's members act on its comments: other agencies, strangers and other sites are refused", async () => {
  const { alice, org, act } = await agency();
  const mallory = await signUp("Mallory Autre");
  await createAgency(mallory, "Studio Intrus");
  expect((await act(mallory, "comments/30/replies", "POST", { message: "intrus" })).status).toBe(404);
  expect((await act(mallory, "comments/30", "DELETE")).status).toBe(404);
  expect((await act(mallory, "comments", "POST", { deliverableId: 1, message: "intrus" })).status).toBe(404);
  expect((await act({ cookie: "", ip: "198.51.200.4" }, "comments", "POST", { deliverableId: 1, message: "anonyme" })).status).toBe(401);
  const crossSite = await fetch(`${baseURL}/api/comments`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://evil.example", cookie: alice.cookie, "x-forwarded-for": alice.ip },
    body: JSON.stringify({ deliverableId: 1, message: "autre site" }),
  });
  expect(crossSite.status).toBe(403);
  expect(((await commentData(org, 30)).replies as unknown[]).length).toBe(1);
});
