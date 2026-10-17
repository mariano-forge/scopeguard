// E-mails about quotes and decisions (src/db/reviewMails.ts): the client's deciders hear of a quote
// and of the answer to their counter-proposal; the agency's owner and administrators hear of every
// decision of the client. Members and contributors get none of them.

import { expect, test } from "@playwright/test";
import { addColleague, call, clientAction, createAgency, linkIn, mailsTo, seedReview, seedState, signUp, unique, verifiedClient, waitForMail } from "./helpers";

const quote = (id: number, commentId: number, status: string, allowCounter = false) => ({ id, version: 1, commentId, description: "Prestation", amount: 900, deadline: 3, status, allowCounter, createdAt: "x" });
const request = (id: number, title: string) => ({ id, deliverableId: 1, author: "Alice Martin", initials: "AM", from: "agency", message: title, title, decision: "Hors périmètre", kind: "request", location: "", time: "t" });

async function review() {
  const alice = await signUp("Alice Martin");
  await createAgency(alice, "Studio Courriels");
  const adam = await addColleague(alice, "Adam Admin", "admin");
  const mia = await addColleague(alice, "Mia Membre", "member");
  const token = unique("tok-mails");
  const { linkKey } = await seedReview(alice, token);
  await seedState(alice, {
    lists: { comments: { upsert: [request(10, "Section témoignages"), request(11, "Page contact")], remove: [] } },
    maps: {
      proposalStates: { upsert: { "10": "draft", "11": "sent" }, remove: [] },
      proposalVersions: { upsert: { "10": [quote(100, 10, "draft")], "11": [quote(110, 11, "sent", true)] }, remove: [] },
    },
  });
  const [claire, bob] = [`${unique("claire")}@client.test`, `${unique("bob")}@client.test`];
  await call("/api/review-access/invite", { person: alice, body: { linkKey, emails: [claire] } });
  await call("/api/review-access/invite", { person: alice, body: { linkKey, emails: [bob], role: "contributor" } });
  const decider = await verifiedClient(token, claire, "Claire Dubois");
  return { alice, adam, mia, token, claire, bob, decider };
}

const subjects = (email: string, part: string) => mailsTo(email).filter((mail) => mail.subject.includes(part));

test("a quote sent reaches the client's deciders, with their personal link; contributors are not asked", async () => {
  const { alice, claire, bob } = await review();
  expect((await call("/api/comments/10/proposal/send", { method: "POST", person: alice, body: {} })).status).toBe(200);
  const mail = await waitForMail(claire, "Proposition : « Section témoignages »");
  expect(mail.subject).toContain("900 € HT");
  expect(mail.replyTo).toBe(alice.email);
  expect(mail.text).toContain("+ 3 jours");
  expect(mail.text).toContain("accepter ou la refuser");
  expect(linkIn(mail)).toMatch(/\/review\/[^?]+\?invitation=/);
  expect(subjects(bob, "Proposition")).toEqual([]);
});

test("the client's decisions reach every owner and administrator, not members; replying writes to the client", async () => {
  const { alice, adam, mia, token, claire, decider } = await review();
  expect((await clientAction(decider, token, "proposals/11/decision", "POST", { decision: "accepted" })).status).toBe(200);
  for (const manager of [alice, adam]) {
    const mail = await waitForMail(manager.email, "Devis accepté : « Page contact »");
    expect(mail.replyTo).toBe(claire);
    expect(mail.text).toContain("Claire Dubois a accepté");
    expect(mail.text).toContain("900 € HT");
    expect(linkIn(mail)).toMatch(/\/projets\/1\/livrables\/1\?demande=11$/);
  }

  expect((await clientAction(decider, token, "changes-request", "POST", { message: "Revoir le titre" })).status).toBe(200);
  expect((await waitForMail(adam.email, "Modifications demandées")).text).toContain("« Revoir le titre »");
  // Quote 10 is still a draft, not waiting for the client: the version can be validated.
  expect((await clientAction(decider, token, "approval", "POST")).status).toBe(200);
  expect(linkIn(await waitForMail(alice.email, "validée par le client"))).toMatch(/\/projets\/1\/livrables\/1$/);
  expect(mailsTo(mia.email).filter((mail) => /Devis|Modifications|validée/.test(mail.subject))).toEqual([]);
});

test("a counter-proposal reaches the administrators; their answer reaches the decider", async () => {
  const { alice, adam, token, claire, bob, decider } = await review();
  expect((await clientAction(decider, token, "proposals/11/adaptation", "POST", { message: "Sans le plan d’accès", budget: 600 })).status).toBe(200);
  const counter = await waitForMail(adam.email, "Contre-proposition sur « Page contact »");
  expect(counter.text).toContain("« Sans le plan d’accès »");
  expect(counter.text).toContain("Budget visé 600 € HT");
  expect(linkIn(counter)).toMatch(/\?demande=11$/);

  expect((await call("/api/comments/11/adaptation/decision", { method: "POST", person: alice, body: { decision: "accepted" } })).status).toBe(200);
  const answer = await waitForMail(claire, "Contre-proposition acceptée");
  expect(answer.text).toContain("« Sans le plan d’accès »");
  expect(answer.replyTo).toBe(alice.email);
  expect(subjects(bob, "Contre-proposition")).toEqual([]);
});
