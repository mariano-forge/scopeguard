// A client reaches a review with a personal link, a code by mail and their name; nobody else does.

import { expect, test } from "@playwright/test";
import { addColleague, call, clientAction, codeFor, createAgency, waitForCode, lastMailTo, linkIn, mailsTo, newIp, newPerson, seedState, readState, seedReview, signUp, sql, unique, verifiedClient } from "./helpers";

async function sharedReview() {
  const alice = await signUp("Alice Martin");
  await createAgency(alice, "Studio Revue");
  const token = unique("tok-review");
  const { linkKey } = await seedReview(alice, token);
  return { alice, token, linkKey };
}

test("personal link: the address shown masked, the code sent to it, name asked once, then the review", async ({ browser }) => {
  const { alice, token, linkKey } = await sharedReview();
  expect((await call(`/api/review/${token}`)).status).toBe(401);

  const email = `${unique("claire")}@client.test`;
  await call("/api/review-access/invite", { person: alice, body: { linkKey, emails: [email] } });
  const invitation = lastMailTo(email);
  expect(invitation?.replyTo).toBe(alice.email);
  const personalLink = linkIn(invitation);
  expect(personalLink).toContain(`/review/${token}?invitation=`);

  // Whoever holds the link (a forwarded mail) learns the first letter and the domain, never the address.
  const masked = `c${"•".repeat(8)}@client.test`;
  const access = await call(`/api/review/${token}/access${new URL(personalLink!).search}`);
  expect(access.json.invitation).toMatchObject({ masked });
  expect(JSON.stringify(access.json)).not.toContain(email);

  const { page, errors } = await newPerson(browser);
  const answers: string[] = [];
  page.on("response", async (response) => {
    if (response.url().includes("/api/")) answers.push(await response.text().catch(() => ""));
  });
  await page.goto(personalLink!);
  await expect(page.getByText(masked)).toBeVisible();
  await expect(page.getByText(email)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Valider cette version" })).toHaveCount(0);
  await page.getByRole("button", { name: "Recevoir un code" }).click();
  await page.getByLabel("Code").fill(await waitForCode(email));
  await expect(page.getByText(masked)).toBeVisible();
  // Until the code proves it, no answer of the server carries the address.
  expect(answers.length).toBeGreaterThan(1);
  expect(answers.some((answer) => answer.includes(email))).toBe(false);
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
  const refused = await call(`/api/review/${token}/access/code`, { body: { email: stranger } });
  expect([refused.status, refused.json]).toEqual([200, { ok: true, invited: false }]);
  expect(mailsTo(stranger)).toEqual([]);
});

test("code requests are limited per address: a link cannot be used to test many addresses", async () => {
  const { token } = await sharedReview();
  const ip = newIp();
  const statuses: number[] = [];
  for (let index = 0; index < 31; index++)
    statuses.push((await call(`/api/review/${token}/access/code`, { person: { ip }, body: { email: `${unique("essai")}@client.test` } })).status);
  expect(statuses.slice(0, 30).every((status) => status === 200)).toBe(true);
  expect(statuses[30]).toBe(429);
});

test("a copied link: the uninvited person gets no code and cannot ask for access; nothing reaches the agency", async ({ browser }) => {
  const { alice, token } = await sharedReview();
  const admin = await addColleague(alice, "Adam Admin", "admin");
  const email = `${unique("transmis")}@client.test`;

  const { page, errors } = await newPerson(browser);
  await page.goto(`/review/${token}`);
  await page.getByLabel("Votre e-mail").fill(email);
  await page.getByRole("button", { name: "Recevoir un code" }).click();
  // No code for an address nobody invited: the page says so, who to turn to, and offers no request nor form.
  // The title names the address that has no access.
  await expect(page.getByRole("heading", { name: `${email} n’est pas invitée sur cette revue` })).toBeVisible();
  await expect(page.getByText("Rapprochez-vous de l’administrateur pour être invité")).toBeVisible();
  await expect(page.getByRole("textbox")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Demander l’accès/ })).toHaveCount(0);
  // Another address can be tried.
  await page.getByRole("button", { name: "Modifier l’adresse" }).click();
  await expect(page.getByLabel("Votre e-mail")).toHaveValue("");
  expect(mailsTo(email)).toEqual([]);
  // The route is gone too: an address of /api that no route serves.
  const asked = await call(`/api/review/${token}/access/request`, { body: { email, message: "Je remplace Claire" } });
  expect([asked.status, asked.json.error]).toEqual([404, "Route inconnue"]);
  // Nothing recorded, nobody notified nor e-mailed.
  expect(((await readState(alice)).accessRequests as unknown[]).length).toBe(0);
  for (const manager of [alice, admin]) expect(mailsTo(manager.email).filter((mail) => mail.subject.includes("demande l’accès"))).toEqual([]);
  expect(errors).toEqual([]);
});

test("an access request received before is still settled by the agency: accepted, the person gets their link", async () => {
  const { alice, linkKey } = await sharedReview();
  const email = `${unique("bob")}@client.test`;
  await sql("insert into review_access_requests (organization_id, link_key, email, status, message) values ($1, $2, $3, 'pending', $4)", [alice.organizationId, linkKey, email, "Je remplace Claire"]);
  expect(((await readState(alice)).accessRequests as { email: string }[]).map((request) => request.email)).toContain(email);
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
  await seedState(alice, { maps: { reviewLinks: { upsert: { [linkKey]: { ...link, invites: [] } }, remove: [] } } });
  expect((await call(`/api/review/${token}`, { person: client })).status).toBe(401);
  expect((await clientAction(client, token, "comments", "POST", { message: "Encore là ?" })).status).toBe(401);

  await seedState(alice, { maps: { reviewLinks: { upsert: { [linkKey]: { ...link, active: false } }, remove: [] } } });
  expect((await call(`/api/review/${token}`, { person: client })).status).toBe(404);
  expect((await clientAction(client, token, "approval")).status).toBe(404);
});

test("a personal link asks the code by its invitation: it reaches the invitee; an unknown invitation gets the same answer and nothing", async () => {
  const { alice, token, linkKey } = await sharedReview();
  const email = `${unique("claire")}@client.test`;
  await call("/api/review-access/invite", { person: alice, body: { linkKey, emails: [email] } });
  const invitation = new URL(linkIn(lastMailTo(email))!).searchParams.get("invitation")!;
  const ip = newIp();

  const unknown = await call(`/api/review/${token}/access/code`, { person: { ip }, body: { invitation: "inventee" } });
  expect([unknown.status, unknown.json]).toEqual([200, { ok: true, invited: false }]);
  const before = mailsTo(email).length;
  const sent = await call(`/api/review/${token}/access/code`, { person: { ip }, body: { invitation } });
  expect(sent.json).toEqual({ ok: true, invited: true });
  const code = await waitForCode(email);
  expect(mailsTo(email).length).toBe(before + 1);

  expect((await call(`/api/review/${token}/access/verify`, { person: { ip }, body: { invitation: "inventee", code } })).status).toBe(400);
  expect((await call(`/api/review/${token}/access/verify`, { person: { ip }, body: { invitation, code } })).status).toBe(200);
});

test("the client’s pages: a real title per step, the deliverable they open, the code in six boxes, on a phone too", async ({ browser }) => {
  const { alice, linkKey } = await sharedReview();
  const email = `${unique("claire")}@client.test`;
  await call("/api/review-access/invite", { person: alice, body: { linkKey, emails: [email] } });
  const personalLink = linkIn(lastMailTo(email))!;
  const { page, errors } = await newPerson(browser);

  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto(personalLink);
    // One title, the deliverable named beside it, the invited address as an account.
    await expect(page.getByRole("heading", { level: 1, name: "Accédez à la revue" })).toBeVisible();
    await expect(page.locator(".gate-context")).toContainText("maquette-1.png");
    await expect(page.locator(".gate-account")).toContainText(`c${"•".repeat(8)}@client.test`);
    await expect(page.getByText("Accès sécurisé")).toBeVisible();
    // Nothing scrolls sideways; on a phone the card loses its frame and takes the width.
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    const card = (await page.locator(".auth-card").boundingBox())!;
    if (width === 390) expect(card.width).toBeGreaterThan(350);
    else expect(card.width).toBeLessThanOrEqual(440);
    // On a wide screen, what the review is for, beside the card; a phone keeps the card alone.
    const welcome = page.getByRole("complementary", { name: "Vos retours, là où ils comptent." });
    if (width === 390) await expect(welcome).toBeHidden();
    else await expect(welcome.getByRole("listitem")).toHaveText([/Commentez sur le livrable/, /Suivez chaque demande/, /Validez en un clic/]);
  }

  // The code: shadcn's six slots over one field, which takes what is typed or pasted.
  await page.getByRole("button", { name: "Recevoir un code" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Vérifiez vos e-mails" })).toBeVisible();
  const slots = page.locator("[data-slot=input-otp-slot]");
  await expect(slots).toHaveCount(6);
  const code = await waitForCode(email);
  await page.getByLabel("Code à 6 chiffres").fill(code);
  await expect(slots).toHaveText(code.split(""));
  await page.getByRole("button", { name: "Accéder à la revue" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Comment vous appelez-vous ?" })).toBeVisible();
  await expect(page.locator(".gate-account")).toContainText("Adresse vérifiée");

  // A link that leads nowhere says so, in the same frame.
  await page.goto(`/review/${unique("tok-inconnu")}`);
  await expect(page.getByRole("heading", { level: 1, name: "Lien indisponible" })).toBeVisible();
  expect(errors).toEqual([]);
});
