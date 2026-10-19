// Agencies are sealed from each other; colleagues join by invitation and lose access when removed.

import { expect, test } from "@playwright/test";
import { PASSWORD, call, createAgency, lastMailTo, linkIn, newPerson, readState, seedState, seedReview, signInPage, signUp, unique, waitForMail } from "./helpers";

test("another agency can neither read, overwrite, preview nor invite on an agency's data", async () => {
  const alice = await signUp("Alice Martin");
  await createAgency(alice, "Studio Alpha");
  const token = unique("tok-alpha");
  await seedReview(alice, token);

  const bob = await signUp("Bob Durand");
  await createAgency(bob, "Studio Beta");
  expect(JSON.stringify(await readState(bob))).not.toContain("Northwind");

  // Same ids as Alice's records: they stay Alice's, whatever route Beta tries.
  expect((await call("/api/deliverables/1", { method: "PATCH", person: bob, body: { name: "écrasé par Beta" } })).status).toBe(404);
  expect((await call("/api/spaces/1", { method: "DELETE", person: bob })).status).toBe(404);
  expect((await call("/api/state", { method: "PATCH", person: bob, body: { changes: { lists: { clients: { upsert: [], remove: [1] } }, maps: {}, settings: { upsert: {}, remove: [] } } } })).status).toBe(405);
  const alpha = await readState(alice);
  expect((alpha.deliverables as { name: string }[])[0].name).toBe("maquette-1.png");
  expect((alpha.clients as unknown[]).length).toBe(1);

  expect((await call(`/api/review/${token}`, { person: bob })).status).toBe(401);
  expect((await call(`/api/review/${token}`, { person: alice })).status).toBe(200);
  expect((await call("/api/review-access/invite", { person: bob, body: { linkKey: "1:1", emails: ["x@y.test"] } })).status).toBe(404);
});

test("a colleague joins from the invitation mail; the wrong account cannot; removal cuts access", async ({ browser }) => {
  const alice = await signUp("Alice Martin");
  await createAgency(alice, "Studio Gamma");
  await seedState(alice, { lists: { clients: { upsert: [{ id: 1, name: "Espace Gamma" }], remove: [] } } });

  const { page: owner } = await newPerson(browser);
  await signInPage(owner, alice.email);
  await owner.getByRole("button", { name: "Compte de Alice Martin" }).first().click();
  await owner.getByRole("menuitem", { name: "Équipe" }).click();
  const carolEmail = `${unique("carol")}@agence.test`;
  await owner.getByLabel("Inviter un collègue").fill(carolEmail);
  await owner.getByRole("button", { name: "Inviter", exact: true }).click();
  await expect(owner.getByText("Invitation en attente")).toBeVisible();

  const invitation = linkIn(lastMailTo(carolEmail));
  expect(invitation).toContain("/invitation/");
  expect(lastMailTo(carolEmail)?.replyTo).toBe(alice.email);

  // Someone else, signed in, cannot take it.
  const intruder = await signUp("Ivan Intrus");
  const invitationId = invitation!.split("/").pop();
  expect((await call("/api/auth/organization/accept-invitation", { person: intruder, body: { invitationId } })).status).toBe(403);
  const { page: intruderPage } = await newPerson(browser);
  await signInPage(intruderPage, intruder.email);
  // Without an agency, the sign-in ends on /bienvenue: opening the link before would cross that redirect.
  await intruderPage.waitForURL("**/bienvenue");
  await intruderPage.goto(invitation!);
  await expect(intruderPage.getByRole("heading", { name: "Ce n’est pas le bon compte" })).toBeVisible();
  await expect(intruderPage.getByText(`c${"•".repeat(8)}@agence.test`)).toBeVisible();
  expect(await intruderPage.content()).not.toContain(carolEmail);

  const { page: carol } = await newPerson(browser);
  await carol.goto(invitation!);
  // Whoever holds the link learns the agency and the address masked, never the address itself.
  await expect(carol.getByText("Rejoignez Studio Gamma")).toBeVisible();
  await expect(carol.getByText(`c${"•".repeat(8)}@agence.test`)).toBeVisible();
  expect(await carol.content()).not.toContain(carolEmail);
  await expect(carol.getByLabel("E-mail")).toHaveValue("");
  await carol.getByLabel("E-mail").fill(carolEmail);
  await carol.getByLabel("Prénom").fill("Carol");
  await carol.getByLabel("Nom", { exact: true }).fill("Petit");
  await carol.getByLabel("Mot de passe").fill(PASSWORD);
  await carol.getByLabel("Confirmation").fill(PASSWORD);
  // The confirmation screen comes once the server has created the account.
  await Promise.all([carol.waitForResponse((answer) => answer.url().includes("/api/auth/sign-up/email")), carol.getByRole("button", { name: "Créer mon compte" }).click()]);
  // The confirmation link signs Carol in and brings her back to the invitation.
  await expect(carol.getByRole("status")).toContainText("lien de confirmation");
  await carol.goto(linkIn(await waitForMail(carolEmail, "Confirmez votre adresse"))!);
  await carol.waitForLoadState("networkidle");
  await carol.getByRole("button", { name: "Rejoindre l’agence" }).click();
  await carol.waitForURL((url) => url.pathname === "/");
  await carol.goto("/espaces");
  await expect(carol.getByText("Espace Gamma").first()).toBeVisible();

  await owner.reload();
  await owner.getByRole("button", { name: "Compte de Alice Martin" }).first().click();
  await owner.getByRole("menuitem", { name: "Équipe" }).click();
  await owner.getByRole("button", { name: "Retirer Carol Petit" }).click();
  await owner.getByRole("button", { name: "Confirmer" }).click();
  await expect(owner.getByText("Carol Petit")).toHaveCount(0);

  await carol.goto("/");
  await carol.waitForURL((url) => url.pathname === "/bienvenue");
});
