// Client roles on a review (src/lib/clientRoles.ts): a decider approves and decides quotes, a
// contributor reads, comments and replies. The server enforces it; the pages show it.

import { expect, test } from "@playwright/test";
import { baseURL } from "../../playwright.config";
import { call, clientAction, createAgency, mailsTo, newPerson, seedReview, seedState, signInPage, signUp, sql, unique, verifiedClient, waitForMail } from "./helpers";

async function reviewWithQuote() {
  const alice = await signUp("Alice Martin");
  await createAgency(alice, "Studio Rôles Client");
  const token = unique("tok-roles-client");
  const { linkKey } = await seedReview(alice, token);
  await seedState(alice, {
    lists: {
      comments: {
        upsert: [{ id: 10, deliverableId: 1, author: "Alice Martin", initials: "AM", from: "agency", message: "Témoignages", decision: "Hors périmètre", kind: "request", title: "Témoignages", location: "", time: "t" }],
        remove: [],
      },
    },
    maps: {
      proposalStates: { upsert: { "10": "sent" }, remove: [] },
      proposalVersions: { upsert: { "10": [{ id: 100, version: 1, commentId: 10, description: "Témoignages", amount: 900, deadline: 3, status: "sent", createdAt: "x", allowCounter: true }] }, remove: [] },
    },
  });
  return { alice, org: alice.organizationId!, token, linkKey };
}

const invitesOf = async (org: string) =>
  (await sql<{ data: { invites?: { email: string; role?: string }[] } }>("select data from review_links where organization_id = $1 and key = '1:1'", [org]))[0].data.invites ?? [];

test("a contributor comments but cannot decide; once made decider by the agency, they can", async () => {
  const { alice, org, token, linkKey } = await reviewWithQuote();
  // Invited by the agency as a contributor.
  const email = `${unique("transmis")}@client.test`;
  await call("/api/review-access/invite", { person: alice, body: { linkKey, emails: [email], role: "contributor" } });
  expect((await invitesOf(org)).find((invite) => invite.email === email)?.role).toBe("contributor");
  expect(mailsTo(email).at(-1)?.subject).toContain("donner votre avis");
  const contributor = await verifiedClient(token, email, "Paul Stagiaire");
  expect((await call(`/api/review/${token}/access`, { person: contributor })).json.role).toBe("contributor");

  const comment = await clientAction(contributor, token, "comments", "POST", { message: "Le logo est trop petit" });
  expect(comment.status).toBe(200);
  expect((await clientAction(contributor, token, "comments/10/replies", "POST", { message: "Je transmets" })).status).toBe(200);
  for (const [path, body] of [
    ["proposals/10/decision", { decision: "accepted" }],
    ["proposals/10/adaptation", { message: "Moins cher ?" }],
    ["changes-request", { message: "Tout revoir" }],
    ["approval", {}],
  ] as const) {
    const refused = await clientAction(contributor, token, path, "POST", body);
    expect(refused.status, path).toBe(403);
    expect(refused.json.code).toBe("DECIDER_ONLY");
  }
  const [proposal] = await sql<{ decision: string | null; adaptation: unknown }>("select decision, adaptation from comment_proposals where organization_id = $1 and comment_id = 10", [org]);
  expect(proposal).toEqual({ decision: null, adaptation: null });
  expect((await sql<{ review_status: string | null }>("select review_status from deliverables where organization_id = $1 and id = 1", [org]))[0].review_status).toBeNull();

  // The agency makes them decider: the same session now decides.
  expect((await call(`/api/deliverables/1/review-link/invites/${encodeURIComponent(email)}`, { method: "PATCH", person: alice, body: { role: "decider" } })).status).toBe(200);
  expect((await clientAction(contributor, token, "proposals/10/decision", "POST", { decision: "accepted" })).status).toBe(200);
  expect((await clientAction(contributor, token, "approval")).status).toBe(200);
  const proof = (await call("/api/proof/1", { person: alice })).json as { approval: { identity: { label: string } } };
  expect(proof.approval.identity.label).toBe(`Client vérifié, décideur : ${email}`);
});

test("invitations carry their role; reminders go to deciders only; bad roles are refused", async () => {
  const { alice, org, linkKey } = await reviewWithQuote();
  const [decider, contributor] = [`${unique("decideur")}@client.test`, `${unique("contributeur")}@client.test`];
  expect((await call("/api/review-access/invite", { person: alice, body: { linkKey, emails: [contributor], role: "contributor" } })).status).toBe(200);
  expect((await call("/api/review-access/invite", { person: alice, body: { linkKey, emails: [decider], role: "admin" } })).status).toBe(400);
  // Nobody to remind but a contributor.
  const early = await call("/api/review-access/remind", { person: alice, body: { linkKey } });
  expect(early.status).toBe(400);
  expect(early.json.error).toContain("décideur");

  expect((await call("/api/review-access/invite", { person: alice, body: { linkKey, emails: [decider] } })).status).toBe(200);
  expect((await invitesOf(org)).map((invite) => [invite.email, invite.role])).toEqual([
    [contributor, "contributor"],
    [decider, "decider"],
  ]);
  expect(mailsTo(decider).at(-1)?.subject).toContain("vous invite à valider");
  // Inviting again keeps the role.
  await call("/api/review-access/invite", { person: alice, body: { linkKey, emails: [contributor], role: "decider" } });
  expect((await invitesOf(org)).find((invite) => invite.email === contributor)?.role).toBe("contributor");

  expect((await call("/api/review-access/remind", { person: alice, body: { linkKey } })).status).toBe(200);
  expect(mailsTo(decider).at(-1)?.subject).toContain("Rappel");
  expect(mailsTo(contributor).some((mail) => mail.subject.includes("Rappel"))).toBe(false);

  expect((await call(`/api/deliverables/1/review-link/invites/${encodeURIComponent(contributor)}`, { method: "PATCH", person: alice, body: { role: "chef" } })).status).toBe(400);
  expect((await call(`/api/deliverables/1/review-link/invites/${encodeURIComponent("personne@client.test")}`, { method: "PATCH", person: alice, body: { role: "decider" } })).status).toBe(404);
});

test("on the page: a contributor sees no approval nor quote decision, and why", async ({ browser }) => {
  const { alice, token, linkKey } = await reviewWithQuote();
  const email = `${unique("lecteur")}@client.test`;
  await call("/api/review-access/invite", { person: alice, body: { linkKey, emails: [email], role: "contributor" } });
  const client = await verifiedClient(token, email, "Paul Stagiaire");
  const { page, errors } = await newPerson(browser);
  const [name, value] = client.cookie.split(";")[0].split("=");
  await page.context().addCookies([{ name, value, url: baseURL }]);
  await page.goto(`/review/${token}`);
  await expect(page.getByText("Contributeur · vos retours sont transmis")).toBeVisible();
  await expect(page.getByRole("button", { name: "Valider cette version" })).toHaveCount(0);
  await page.getByRole("tab", { name: /Hors scope/ }).click();
  await page.locator(".client-side-panel li.inspector-row").filter({ hasText: "Témoignages" }).getByRole("button", { name: "Voir la proposition" }).click();
  await expect(page.getByText("Seul le décideur désigné par l’organisation peut accepter ou refuser cette proposition.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Accepter" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Refuser" })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("in « Partager la revue », the agency invites someone, then sets them contributor and decider in the list", async ({ browser }) => {
  const { alice, org } = await reviewWithQuote();
  const email = `${unique("equipe")}@client.test`;
  const { page, errors } = await newPerson(browser);
  await signInPage(page, alice.email);
  await page.goto("/projets/1/livrables/1");
  await page.getByRole("button", { name: "Partager la revue" }).first().click();
  // One field and its button: the role is set afterwards, person by person.
  await expect(page.getByRole("combobox", { name: "Rôle des personnes invitées" })).toHaveCount(0);
  await page.getByLabel("Inviter par e-mail").fill(email);
  await page.getByRole("button", { name: "Inviter", exact: true }).click();
  await expect.poll(async () => (await invitesOf(org)).find((invite) => invite.email === email)?.role ?? "none").not.toBe("none");
  await waitForMail(email, "vous invite à valider");

  const role = page.getByRole("combobox", { name: `Rôle de ${email}` });
  await expect(role).toHaveText("Décideur");
  await role.click();
  await page.getByRole("option", { name: "Contributeur" }).click();
  await expect.poll(async () => (await invitesOf(org)).find((invite) => invite.email === email)?.role).toBe("contributor");
  await role.click();
  await page.getByRole("option", { name: "Décideur" }).click();
  await expect.poll(async () => (await invitesOf(org)).find((invite) => invite.email === email)?.role).toBe("decider");
  const events = await sql<{ description: string }>("select data->>'description' as description from audit_events where organization_id = $1 and type = 'review-link.invite-role' order by id", [org]);
  expect(events.map((event) => event.description)).toEqual([`${email} : contributeur`, `${email} : décideur`]);
  expect(errors).toEqual([]);
});
