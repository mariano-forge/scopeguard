// An out-of-scope request offered to the client (US-046, src/lib/requestOffer.ts): one of the two ways of its
// proposal, prepared with the qualification (« Facturer » or « Offrir »), valued, the agency's draft until
// « Envoyer la proposition »; then « Offerte » with its value for the client, told by e-mail, with nothing to
// decide; taken back, each step in the journal; sent or taken back by the agency's administrators only.

import { expect, test } from "@playwright/test";
import { baseURL } from "../../playwright.config";
import { addColleague, call, createAgency, mailsTo, newPerson, seedState, signInPage, signUp, sql, unique, verifiedClient, type Member } from "./helpers";

const request = (id: number, title: string, decision = "Hors périmètre") => ({
  id, deliverableId: 1, author: "Alice Martin", initials: "AM", from: "agency", kind: "request", message: title, title, decision, location: "", time: "t",
});
const quote = (id: number, commentId: number, status: string) => ({ id, commentId, version: 1, amount: 900, deadline: 3, status, createdAt: "x", description: "Devis" });

/** An amount as Kora writes it: a non-breaking space before the euro sign (an attribute is compared exactly). */
const euro = (amount: number) => `${amount}${String.fromCharCode(0xa0)}€`;

/** A version shared with Claire, a decider: out-of-scope requests at each stage, and one included. */
async function sharedVersion() {
  const alice = await signUp("Alice Martin");
  await createAgency(alice, "Studio Offert");
  const token = unique("tok-offer");
  await seedState(alice, {
    lists: {
      clients: { upsert: [{ id: 1, name: "Northwind" }], remove: [] },
      projects: { upsert: [{ id: 1, name: "Refonte", clientId: 1, client: "Northwind", status: "En cours" }], remove: [] },
      deliverables: { upsert: [{ id: 1, projectId: 1, name: "maquette.pdf", type: "PDF", version: 1, status: "En attente client", locked: false, importedAt: "14/10/2026" }], remove: [] },
      comments: {
        upsert: [request(40, "Page FAQ"), request(41, "Version anglaise"), request(42, "Blog"), request(43, "Newsletter"), request(44, "Animation du logo"), request(45, "Corriger le titre", "Inclus")],
        remove: [],
      },
    },
    maps: {
      reviewLinks: { upsert: { "1:1": { token, active: true, expiresAt: "01/01/2099", autoExpire: true, deliverableId: 1, version: 1 } }, remove: [] },
      // 41 quoted (a draft), 42 sent and waiting, 43 accepted, 44 refused.
      proposalStates: { upsert: { "41": "draft", "42": "sent", "43": "sent", "44": "sent" }, remove: [] },
      proposalVersions: { upsert: { "41": [quote(410, 41, "draft")], "42": [quote(420, 42, "sent")], "43": [quote(430, 43, "accepted")], "44": [quote(440, 44, "refused")] }, remove: [] },
      proposalDecisions: { upsert: { "43": "accepted", "44": "refused" }, remove: [] },
    },
  });
  const email = `${unique("claire")}@client.test`;
  await call("/api/review-access/invite", { person: alice, body: { linkKey: "1:1", emails: [email] } });
  const client = await verifiedClient(token, email, "Claire Dubois");
  return { alice, org: alice.organizationId!, token, email, client };
}

const offerOf = async (org: string, id: number) =>
  (await sql<{ offer: Record<string, unknown> | null }>("select data->'offer' as offer from comments where organization_id = $1 and id = $2", [org, id]))[0]?.offer ?? null;
const eventsOf = async (org: string, type: string) =>
  (await sql<{ description: string }>("select data->>'description' as description from audit_events where organization_id = $1 and type = $2 order by id", [org, type])).map((row) => row.description);
const qualify = (person: Member | undefined, id: number, body: Record<string, unknown>) =>
  call(`/api/comments/${id}/qualification`, { method: "PUT", person, body: { decision: "Hors périmètre", title: `Demande ${id}`, ...body } });
const send = (person: Member, id: number) => call(`/api/comments/${id}/proposal/send`, { method: "POST", person, body: {} });

test("an offer is prepared with the qualification, the client sees it once sent, and it is taken back", async ({ browser }) => {
  const { alice, org, token, email, client } = await sharedVersion();
  const { page, errors } = await newPerson(browser);
  await signInPage(page, alice.email);
  await page.goto("/projets/1/livrables/1");
  const panel = page.getByRole("complementary", { name: "Demandes" });
  await panel.getByRole("tab", { name: /^Hors scope/ }).click();
  const card = panel.getByRole("tabpanel").getByRole("listitem").filter({ hasText: "Page FAQ" });
  await expect(card).toContainText("À chiffrer");

  // « Préparer la proposition »: its two ways, « Facturer » or « Offrir »; an offer's value is required.
  await card.getByRole("button", { name: "Préparer la proposition" }).click();
  const bubble = page.getByRole("dialog", { name: /#40$/ });
  const ways = bubble.getByRole("radiogroup", { name: "Proposition" });
  await expect(ways.getByRole("radio")).toHaveText([/Facturer/, /Offrir/]);
  await ways.getByRole("radio", { name: /^Offrir/ }).click();
  await bubble.getByRole("button", { name: "Enregistrer" }).click();
  await expect(bubble.getByText("Ce champ est obligatoire.")).toBeVisible();
  await bubble.getByLabel("Valeur offerte HT").fill("450");
  await bubble.getByLabel("Délai", { exact: true }).fill("2");
  await bubble.getByRole("button", { name: "Enregistrer" }).click();
  await expect.poll(() => offerOf(org, 40)).toEqual({ amount: 450, days: 2 });
  expect(await eventsOf(org, "proposal.drafted")).toEqual(["Offre préparée : 450 € · + 2 jours"]);
  await expect(card).toContainText("Prête pour l’envoi");
  await expect(card.locator(".client-proposal-line")).toContainText("Valeur offerte450 € HT");

  // Prepared, it is the agency's draft: the client sees nothing of it.
  const before = (await call(`/api/review/${token}`, { person: client })).json as { state: { comments: { id: number; offer?: unknown }[] } };
  expect(before.state.comments.find((comment) => comment.id === 40)).not.toHaveProperty("offer");

  // Sent as a proposal: the window says what the client will see; the deciders are told by e-mail.
  const mailsBefore = mailsTo(email).length;
  await card.getByRole("button", { name: "Envoyer la proposition" }).click();
  const confirm = page.getByRole("alertdialog", { name: "Envoyer l’offre au client ?" });
  await expect(confirm).toContainText("« Offerte » avec sa valeur, sans rien à décider");
  await confirm.getByRole("button", { name: "Envoyer l’offre" }).click();
  await expect.poll(() => offerOf(org, 40)).toMatchObject({ amount: 450, days: 2, sentAt: expect.any(Number), sentBy: "Alice Martin" });
  expect(await eventsOf(org, "proposal.offered")).toEqual(["Offre envoyée au client : 450 € · + 2 jours"]);
  await expect(card).toContainText("Offerte");
  await expect.poll(() => mailsTo(email).length).toBe(mailsBefore + 1);
  expect(mailsTo(email).at(-1)).toMatchObject({ subject: "Offert : « Page FAQ »" });

  // The client reads « Offerte » and its value, without who sent it, and has nothing to decide.
  const seen = (await call(`/api/review/${token}`, { person: client })).json as { state: { comments: { id: number; offer?: Record<string, unknown> }[] } };
  const offered = seen.state.comments.find((comment) => comment.id === 40)?.offer;
  expect(offered).toMatchObject({ amount: 450, days: 2 });
  expect(offered).not.toHaveProperty("sentBy");
  const { page: clientPage, errors: clientErrors } = await newPerson(browser);
  const [name, value] = client.cookie.split(";")[0].split("=");
  await clientPage.context().addCookies([{ name, value, url: baseURL }]);
  await clientPage.goto(`/review/${token}`);
  const clientPanel = clientPage.getByRole("complementary", { name: "Vos retours" });
  await clientPanel.getByRole("tab", { name: /^Hors scope/ }).click();
  const clientCard = clientPanel.getByRole("tabpanel").getByRole("listitem").filter({ hasText: "Page FAQ" });
  await expect(clientCard).toContainText("Offerte");
  await expect(clientCard.locator(".client-proposal-line")).toContainText("Valeur offerte450 € HT");
  await expect(clientCard.getByRole("button")).toHaveCount(1);
  await clientCard.getByRole("button").click();
  await expect(clientPage.getByRole("dialog", { name: /#40$/ })).toContainText("Offerte par l’organisation · 450 € · + 2 jours");
  expect(clientErrors).toEqual([]);

  // Taken back: to answer again, said in the journal.
  await card.getByRole("button", { name: "Annuler l’offre" }).click();
  await expect.poll(() => offerOf(org, 40)).toBeNull();
  await expect(card).toContainText("À chiffrer");
  expect(await eventsOf(org, "proposal.offer-cancelled")).toEqual(["Offre retirée : la demande est de nouveau à chiffrer"]);
  expect(errors).toEqual([]);
});

test("a member prepares an offer, the administrators send it; offered until the client decides, and not quoted meanwhile", async () => {
  const { alice, org } = await sharedVersion();
  const bob = await addColleague(alice, "Bob Membre", "member");

  // A value, positive; a quote or an offer, not both.
  expect((await qualify(alice, 40, { offer: {} })).status).toBe(400);
  expect((await qualify(alice, 40, { offer: { amount: 0 } })).status).toBe(400);
  expect((await qualify(alice, 40, { offer: { amount: 450 }, quote: { amount: 900, days: 3 } })).status).toBe(400);
  // Another agency's request.
  const stranger = await signUp("Sam Dehors");
  await createAgency(stranger, "Autre Studio");
  expect((await qualify(stranger, 40, { offer: { amount: 450 } })).status).toBe(404);

  // A member prepares it, as they draft a quote; sending it is the administrators'.
  expect((await qualify(bob, 40, { offer: { amount: 450, days: 2 } })).status).toBe(200);
  expect(await offerOf(org, 40)).toEqual({ amount: 450, days: 2 });
  const refusedToMember = await send(bob, 40);
  expect(refusedToMember.status).toBe(403);
  expect(refusedToMember.json.error).toContain("offrir une demande hors scope");
  expect(await offerOf(org, 40)).not.toHaveProperty("sentAt");
  expect((await send(alice, 40)).status).toBe(200);
  // Sent: as the client read it, until taken back; never quoted meanwhile.
  expect((await qualify(alice, 40, { offer: { amount: 300 } })).status).toBe(409);
  expect((await call("/api/comments/40/proposal/versions", { method: "POST", person: alice, body: { description: "Page FAQ", amount: 900, deadline: 3, send: true } })).status).toBe(409);
  expect((await call("/api/comments/40/offer", { method: "DELETE", person: bob })).status).toBe(403);
  expect((await call("/api/comments/40/offer", { method: "DELETE", person: alice })).status).toBe(200);
  expect((await call("/api/comments/40/offer", { method: "DELETE", person: alice })).status).toBe(409);

  // In place of a draft quote, which goes.
  expect((await qualify(alice, 41, { offer: { amount: 450 } })).status).toBe(200);
  expect(await sql("select 1 from proposal_versions where organization_id = $1 and comment_id = 41", [org])).toHaveLength(0);
  // Never over a quote waiting for the client, nor once one was accepted.
  expect((await qualify(alice, 42, { offer: { amount: 450 } })).status).toBe(409);
  expect((await qualify(alice, 43, { offer: { amount: 450 } })).status).toBe(409);
  expect(await offerOf(org, 42)).toBeNull();
  // Not out of scope: nothing to offer.
  expect((await qualify(alice, 45, { decision: "Inclus", offer: { amount: 450 } })).status).toBe(200);
  expect(await offerOf(org, 45)).toBeNull();
  // A prepared offer goes when the request is no longer out of scope.
  expect((await qualify(alice, 41, { decision: "Inclus" })).status).toBe(200);
  expect(await offerOf(org, 41)).toBeNull();
});

test("what the agency offered is measured once sent, in « Suivi », on the home page and in the proof", async ({ browser }) => {
  const { alice } = await sharedVersion();
  // One offer sent, one only prepared: only the first counts.
  expect((await qualify(alice, 40, { title: "Page FAQ", offer: { amount: 450, days: 2 } })).status).toBe(200);
  expect((await send(alice, 40)).status).toBe(200);
  expect((await qualify(alice, 41, { title: "Version anglaise", offer: { amount: 1000 } })).status).toBe(200);
  const { page, errors } = await newPerson(browser);
  await signInPage(page, alice.email);

  await page.goto("/projets/1/suivi");
  const funnel = page.getByRole("region", { name: "Du hors scope au devis accepté" });
  await expect(funnel.getByRole("term").filter({ hasText: "Offertes au client" }).locator("xpath=..").getByRole("definition")).toHaveText("1 demande · 450 €");

  await page.goto("/");
  const proposals = page.locator(".browser-section").filter({ has: page.getByRole("heading", { level: 2, name: "Propositions au client" }) });
  await expect(proposals.getByRole("img")).toHaveAttribute("aria-label", new RegExp(`Offerte, 1 proposition · ${euro(450)}`));
  const register = page.locator(".browser-section").filter({ has: page.getByRole("heading", { level: 2, name: /^Registre des demandes/ }) });
  // Five rows a page: found by its title.
  await register.getByRole("searchbox", { name: "Rechercher dans le registre" }).fill("Page FAQ");
  const row = register.getByRole("row").filter({ hasText: "Page FAQ" });
  // Its value as the amount, « Offerte » as where its proposal stands.
  await expect(row).toContainText("450 €");
  await expect(row).toContainText("Offerte");

  const proof = await call("/api/proof/1", { person: alice });
  expect(proof.status).toBe(200);
  const requests = proof.json.requests as { id: number; offer: { amount: number; days: number; event: unknown } | null }[];
  expect(requests.find((item) => item.id === 40)?.offer).toMatchObject({ amount: 450, days: 2, event: expect.anything() });
  expect(requests.find((item) => item.id === 41)?.offer).toBeNull();
  expect(errors).toEqual([]);
});
