// The client's action routes (/api/review/:token/…, src/db/reviewActions.ts): each one goes through
// the client rules, is built from the stored records, and is refused whole when the rules drop it.

import { expect, test } from "@playwright/test";
import { baseURL } from "../../playwright.config";
import { call, createAgency, seedState, seedReview, signUp, sql, unique, verifiedClient, type Member, type Person } from "./helpers";

async function review() {
  const alice = await signUp("Alice Martin");
  await createAgency(alice, "Studio Actions");
  const token = unique("tok-actions");
  const { linkKey } = await seedReview(alice, token);
  const quote = (commentId: number, extra: Record<string, unknown> = {}) => [{ id: commentId * 10, version: 1, commentId, description: "Devis", amount: 500, deadline: 2, status: "sent", createdAt: "x", ...extra }];
  await seedState(alice, {
    lists: {
      deliverables: { upsert: [{ id: 2, projectId: 1, name: "autre.pdf", version: 1 }], remove: [] },
      comments: {
        upsert: [
          { id: 10, deliverableId: 1, author: "Alice Martin", initials: "AM", from: "agency", message: "Témoignages", decision: "Hors périmètre", kind: "request", title: "Témoignages", location: "", time: "t" },
          { id: 11, deliverableId: 1, author: "Alice Martin", initials: "AM", from: "agency", message: "Carte", decision: "Hors périmètre", kind: "request", title: "Carte", location: "", time: "t" },
          { id: 12, deliverableId: 1, author: "Alice Martin", initials: "AM", from: "agency", message: "Note de l’agence", decision: "Inclus", kind: "request", title: "Note de l’agence", location: "", time: "t", position: { x: 5, y: 5 }, replies: [{ id: 1, from: "agency", message: "Précision" }] },
          { id: 13, deliverableId: 1, author: "Alice Martin", initials: "AM", from: "agency", message: "Brouillon", decision: "Hors périmètre", kind: "request", title: "Brouillon", location: "", time: "t" },
          // 14: a pin of the agency, no status chosen: internal. 15: the client's own, still to clarify.
          { id: 14, deliverableId: 1, author: "Alice Martin", initials: "AM", from: "agency", message: "Note interne", decision: "À qualifier", kind: "remark", location: "", time: "t" },
          { id: 15, deliverableId: 1, author: "Claire Dubois", initials: "CD", from: "client", message: "Question du client", decision: "À qualifier", kind: "remark", location: "", time: "t" },
          { id: 20, deliverableId: 2, author: "Alice Martin", initials: "AM", from: "agency", message: "Autre version", decision: "À qualifier", kind: "remark", location: "", time: "t" },
        ],
        remove: [],
      },
    },
    maps: {
      proposalStates: { upsert: { "10": "sent", "11": "sent", "13": "draft" }, remove: [] },
      proposalVersions: { upsert: { "10": quote(10), "11": quote(11, { allowCounter: false }), "13": quote(13, { status: "draft" }) }, remove: [] },
    },
  });
  const email = `${unique("claire")}@client.test`;
  await call("/api/review-access/invite", { person: alice, body: { linkKey, emails: [email] } });
  const client = await verifiedClient(token, email, "Claire Dubois");
  const act = (path: string, method: "POST" | "PATCH" | "DELETE", body?: Record<string, unknown>, person: Partial<Person> = client) =>
    call(`/api/review/${token}/${path}`, { method, person, body });
  return { alice, org: alice.organizationId!, token, email, act };
}

const commentData = async (org: string, id: number) =>
  (await sql<{ data: Record<string, unknown> }>("select data from comments where organization_id = $1 and id = $2", [org, id]))[0]?.data;

test("comments: created and signed by the server, changed only by their author, on this version only", async () => {
  const { org, email, act } = await review();

  // What the page claims about the author is ignored; a taken id is replaced.
  const created = await act("comments", "POST", { id: 20, message: "  Le logo  ", author: "Faux", from: "agency", decision: "Inclus", page: 2, position: { x: 10, y: 20 }, area: { x: 5, y: 15, w: 10, h: 10 } });
  expect(created.status).toBe(200);
  const id = created.json.id as number;
  expect(id).not.toBe(20);
  expect(await commentData(org, id)).toMatchObject({ message: "Le logo", author: "Claire Dubois", from: "client", authorEmail: email, decision: "À qualifier", page: 2, position: { x: 10, y: 20 } });
  expect((await commentData(org, 20)).message).toBe("Autre version");
  // The answer brings the review after the action, limited to the shared version.
  const answered = created.json as { state: { comments: { id: number }[]; deliverables: { id: number }[] } };
  expect(answered.state.comments.map((comment) => comment.id)).toContain(id);
  expect(answered.state.comments.map((comment) => comment.id)).not.toContain(20);
  expect(answered.state.deliverables.map((deliverable) => deliverable.id)).toEqual([1]);

  expect((await act(`comments/${id}`, "PATCH", { page: 3, x: 50, y: 60 })).status).toBe(200);
  expect(await commentData(org, id)).toMatchObject({ page: 3, position: { x: 50, y: 60 }, area: { x: 45, y: 55, w: 10, h: 10 } });

  const reply = await act(`comments/${id}/replies`, "POST", { message: "Sur mobile" });
  expect(reply.status).toBe(200);
  expect(((await commentData(org, id)).replies as Record<string, unknown>[])[0]).toMatchObject({ id: reply.json.id, message: "Sur mobile", authorEmail: email });

  // The agency's messages: a reply is allowed, nothing else.
  expect((await act("comments/12/replies", "POST", { message: "Merci" })).status).toBe(200);
  expect((await act("comments/12", "PATCH", { message: "réécrit" })).status).toBe(409);
  expect((await act("comments/12", "PATCH", { page: 1, x: 90, y: 90 })).status).toBe(409);
  expect((await act("comments/12/replies/1", "PATCH", { message: "réécrit" })).status).toBe(409);
  expect((await act("comments/12/replies/1", "DELETE")).status).toBe(409);
  expect((await act("comments/12", "DELETE")).status).toBe(409);
  expect(await commentData(org, 12)).toMatchObject({ message: "Note de l’agence", position: { x: 5, y: 5 } });
  expect(((await commentData(org, 12)).replies as unknown[]).length).toBe(2);
  // Another version's comment, unknown ids, malformed bodies.
  expect((await act("comments/20/replies", "POST", { message: "ailleurs" })).status).toBe(404);
  expect((await act("comments/999/replies/1", "DELETE")).status).toBe(404);
  expect((await act("comments", "POST", { message: "   " })).status).toBe(400);
  expect((await act(`comments/${id}`, "PATCH", { page: 1, x: 150, y: 0 })).status).toBe(400);
  expect((await act("comments/abc", "DELETE")).status).toBe(400);

  // Once qualified by the agency, the client's remark is no longer theirs to delete.
  await sql("update comments set data = jsonb_set(data, '{decision}', '\"Inclus\"'), decision = 'Inclus' where organization_id = $1 and id = $2", [org, id]);
  expect((await act(`comments/${id}`, "DELETE")).status).toBe(409);
  const own = (await act("comments", "POST", { message: "À retirer" })).json.id as number;
  expect((await act(`comments/${own}`, "DELETE")).status).toBe(200);
  expect(await commentData(org, own)).toBeUndefined();
});

test("quotes: decided once, adaptations only when allowed, nothing on a quote not sent", async () => {
  const { org, act } = await review();
  // 13: an out-of-scope request never quoted to the client is unknown to them.
  // A quote still a draft: the request shows (« En cours de chiffrage »), the quote cannot be decided.
  expect((await act("proposals/13/decision", "POST", { decision: "accepted" })).status).toBe(409);
  expect((await act("proposals/10/decision", "POST", { decision: "peut-être" })).status).toBe(400);
  expect((await act("proposals/11/adaptation", "POST", { message: "Moins cher ?" })).status).toBe(409);

  expect((await act("proposals/10/adaptation", "POST", { message: "Moins cher ?", budget: 300, deadline: -1 })).status).toBe(200);
  const [adapted] = await sql<{ adaptation: Record<string, unknown> }>("select adaptation from comment_proposals where organization_id = $1 and comment_id = 10", [org]);
  expect(adapted.adaptation).toMatchObject({ message: "Moins cher ?", budget: 300 });
  expect(adapted.adaptation.deadline).toBeUndefined();

  expect((await act("proposals/10/decision", "POST", { decision: "refused" })).status).toBe(200);
  expect((await act("proposals/10/decision", "POST", { decision: "accepted" })).status).toBe(409);
  const [decided] = await sql<{ decision: string }>("select decision from comment_proposals where organization_id = $1 and comment_id = 10", [org]);
  expect(decided.decision).toBe("refused");
  const [quote] = await sql<{ data: { status: string } }>("select data from proposal_versions where organization_id = $1 and comment_id = 10", [org]);
  expect(quote.data.status).toBe("refused");
});

test("the version: changes requested, approved once its quotes are decided; after that, every action is refused", async () => {
  const { org, act } = await review();
  expect((await act("changes-request", "POST", { message: "" })).status).toBe(400);
  expect((await act("changes-request", "POST", { message: "Revoir les couleurs" })).status).toBe(200);
  const events = await sql<{ type: string; description: string }>("select data->>'type' as type, data->>'description' as description from audit_events where organization_id = $1", [org]);
  expect(events).toContainEqual({ type: "review.changes-requested", description: "Le client demande des modifications : « Revoir les couleurs »" });

  // Two sent quotes still wait for the client: no validation that would freeze them undecided.
  const early = await act("approval", "POST");
  expect(early.status).toBe(409);
  expect(early.json.error).toContain("2 propositions attendent votre décision");
  expect((await sql<{ review_status: string | null }>("select review_status from deliverables where organization_id = $1 and id = 1", [org]))[0].review_status).toBe("changes-requested");
  expect((await act("proposals/10/decision", "POST", { decision: "accepted" })).status).toBe(200);
  expect((await act("approval", "POST")).json.error).toContain("1 proposition attend votre décision");
  expect((await act("proposals/11/decision", "POST", { decision: "refused" })).status).toBe(200);

  expect((await act("approval", "POST")).status).toBe(200);
  const [version] = await sql<{ review_status: string; locked: boolean }>("select review_status, locked from deliverables where organization_id = $1 and id = 1", [org]);
  expect(version).toEqual({ review_status: "approved", locked: true });
  // The client's remark still to clarify (15) is named as given up; the agency's pin (14), never shown to the client, is not.
  const [approval] = await sql<{ description: string }>("select data->>'description' as description from audit_events where organization_id = $1 and type = 'deliverable.approved'", [org]);
  expect(approval.description).toBe("Version 1 approuvée par le client ; remarque abandonnée : « Question du client »");

  expect((await act("approval", "POST")).status).toBe(409);
  expect((await act("changes-request", "POST", { message: "Finalement non" })).status).toBe(409);
  expect((await act("comments", "POST", { message: "Après coup" })).status).toBe(409);
  expect((await act("comments/12/replies", "POST", { message: "Après coup" })).status).toBe(409);
  expect((await act("proposals/10/decision", "POST", { decision: "accepted" })).status).toBe(409);
});

test("only a verified client of the link acts: preview, strangers, other sites and unknown links are refused", async () => {
  const { alice, token, act } = await review();
  const agencyPreview = await act("comments", "POST", { message: "Depuis l’aperçu" }, alice as Member);
  expect(agencyPreview.status).toBe(403);
  expect((await act("approval", "POST", undefined, { cookie: "", ip: "198.51.200.3" })).status).toBe(401);
  expect((await call(`/api/review/${unique("inconnu")}/approval`, { method: "POST", body: {} })).status).toBe(404);

  const crossSite = await fetch(`${baseURL}/api/review/${token}/approval`, { method: "POST", headers: { "content-type": "application/json", origin: "https://evil.example" }, body: "{}" });
  expect(crossSite.status).toBe(403);
});
