// A client reaches a review with a personal link, a code by mail and their name; nobody else does.

import { expect, test } from "@playwright/test";
import { call, clientAction, codeFor, createAgency, waitForCode, lastMailTo, linkIn, mailsTo, newIp, newPerson, patchState, readState, seedReview, signUp, unique, verifiedClient } from "./helpers";

async function sharedReview() {
  const alice = await signUp("Alice Martin");
  await createAgency(alice, "Studio Revue");
  const token = unique("tok-review");
  const { linkKey } = await seedReview(alice, token);
  return { alice, token, linkKey };
}

test("personal link: e-mail pre-filled, code, name asked once, then the review", async ({ browser }) => {
  const { alice, token, linkKey } = await sharedReview();
  expect((await call(`/api/review/${token}`)).status).toBe(401);

  const email = `${unique("claire")}@client.test`;
  await call("/api/review-access/invite", { person: alice, body: { linkKey, emails: [email] } });
  const invitation = lastMailTo(email);
  expect(invitation?.replyTo).toBe(alice.email);
  const personalLink = linkIn(invitation);
  expect(personalLink).toContain(`/review/${token}?invitation=`);

  const { page, errors } = await newPerson(browser);
  await page.goto(personalLink!);
  await expect(page.getByText(email)).toBeVisible();
  await expect(page.getByRole("button", { name: "Valider cette version" })).toHaveCount(0);
  await page.getByRole("button", { name: "Recevoir un code" }).click();
  await page.getByLabel("Code").fill(await waitForCode(email));
  await page.getByRole("button", { name: "Accéder à la revue" }).click();
  await expect(page.getByRole("heading", { name: "Comment vous appelez-vous ?" })).toBeVisible();
  await page.getByLabel("Nom complet").fill("  Claire   Dubois ");
  await page.getByRole("button", { name: "Accéder à la revue" }).click();
  await expect(page.getByRole("button", { name: "Valider cette version" })).toBeVisible();

  const cookie = (await page.context().cookies()).find((candidate) => candidate.name === "kora_review_session");
  expect(cookie?.httpOnly).toBe(true);
  expect(Math.round((cookie!.expires * 1000 - Date.now()) / 86_400_000)).toBe(30);

  await page.reload();
  await expect(page.getByRole("button", { name: "Valider cette version" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Comment vous appelez-vous ?" })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("codes: five wrong tries end a code, one code a minute, uninvited addresses get nothing", async () => {
  const { alice, token, linkKey } = await sharedReview();
  const email = `${unique("claire")}@client.test`;
  await call("/api/review-access/invite", { person: alice, body: { linkKey, emails: [email] } });
  const ip = newIp();
  await call(`/api/review/${token}/access/code`, { person: { ip }, body: { email } });
  const good = codeFor(email);
  for (let attempt = 1; attempt <= 5; attempt++) {
    const wrong = String((Number(good) + attempt) % 1_000_000).padStart(6, "0");
    expect((await call(`/api/review/${token}/access/verify`, { person: { ip }, body: { email, code: wrong } })).status).toBe(400);
  }
  expect((await call(`/api/review/${token}/access/verify`, { person: { ip }, body: { email, code: good } })).status).toBe(400);

  const before = mailsTo(email).length;
  expect((await call(`/api/review/${token}/access/code`, { person: { ip }, body: { email } })).status).toBe(200);
  expect(mailsTo(email).length).toBe(before);

  const stranger = `${unique("bob")}@client.test`;
  expect((await call(`/api/review/${token}/access/code`, { body: { email: stranger } })).status).toBe(200);
  expect(mailsTo(stranger)).toEqual([]);
});

test("an uninvited person asks for access; the agency accepts and they get their link", async () => {
  const { alice, token, linkKey } = await sharedReview();
  const email = `${unique("bob")}@client.test`;
  await call(`/api/review/${token}/access/request`, { body: { email, message: "Je remplace Claire" } });
  const state = await readState(alice);
  const requests = state.accessRequests as { email: string; message: string }[];
  expect(requests.map((request) => request.email)).toContain(email);
  expect((state.notifications as { message: string }[])[0].message).toContain(email);

  await call("/api/review-access/requests", { person: alice, body: { linkKey, email, decision: "accepted" } });
  expect(linkIn(lastMailTo(email))).toContain("invitation=");
  expect(((await readState(alice)).accessRequests as unknown[]).length).toBe(0);
});

test("the agency previews read-only; removing an invitation or revoking the link closes the review", async () => {
  const { alice, token, linkKey } = await sharedReview();
  expect((await call(`/api/review/${token}`, { person: alice })).status).toBe(200);
  expect((await clientAction(alice, token, "comments", "POST", { message: "Depuis l’aperçu" })).status).toBe(403);

  const email = `${unique("claire")}@client.test`;
  await call("/api/review-access/invite", { person: alice, body: { linkKey, emails: [email] } });
  const client = await verifiedClient(token, email);
  expect((await call(`/api/review/${token}`, { person: client })).status).toBe(200);

  const links = (await readState(alice)).reviewLinks as Record<string, { invites: { email: string }[] }>;
  const link = links[linkKey];
  await patchState(alice, { maps: { reviewLinks: { upsert: { [linkKey]: { ...link, invites: [] } }, remove: [] } } });
  expect((await call(`/api/review/${token}`, { person: client })).status).toBe(401);
  expect((await clientAction(client, token, "comments", "POST", { message: "Encore là ?" })).status).toBe(401);

  await patchState(alice, { maps: { reviewLinks: { upsert: { [linkKey]: { ...link, active: false } }, remove: [] } } });
  expect((await call(`/api/review/${token}`, { person: client })).status).toBe(404);
  expect((await clientAction(client, token, "approval")).status).toBe(404);
});
