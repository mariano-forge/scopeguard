// The sidebar's pages: « Équipe » (/equipe), « Aide » (/aide) and « Partagés avec moi » (/partages): the
// agencies one is a member of, and the reviews other agencies invited one's own address to, as a client
// (src/db/sharedWithMe.ts, the one read across agencies: by the person's verified address only).

import { expect, test } from "@playwright/test";
import { call, createAgency, newPerson, seedReview, seedState, signInPage, signUp, sql, unique } from "./helpers";

test("« Équipe » and « Aide » lead to their pages: the team, the guides, the guided tour once more, the shortcuts", async ({ browser }) => {
  const alice = await signUp("Alice Martin");
  await createAgency(alice, "Studio Pages");
  const { page, errors } = await newPerson(browser);
  await signInPage(page, alice.email);
  await page.goto("/");
  // No favourite yet: said in a few words.
  await expect(page.getByText("Vos projets et livrables ajoutés en favoris s’affichent ici.")).toBeVisible();
  // A space opens on its projects, one click away.
  await seedState(alice, {
    lists: {
      clients: { upsert: [{ id: 7, name: "Maison Manuel" }], remove: [] },
      projects: { upsert: [{ id: 7, name: "Catalogue", clientId: 7, client: "Maison Manuel", status: "En cours" }], remove: [] },
    },
  });
  await page.reload();
  const navigation = page.getByRole("navigation").filter({ has: page.getByRole("link", { name: /Maison Manuel/ }) });
  await expect(navigation.getByRole("link", { name: "Catalogue" })).toHaveCount(0);
  await navigation.getByRole("button", { name: "Afficher les projets de Maison Manuel" }).click();
  await expect(navigation.getByRole("list", { name: "Projets de Maison Manuel" }).getByRole("link", { name: "Catalogue" })).toHaveAttribute("href", "/projets/7");
  await navigation.getByRole("button", { name: "Masquer les projets de Maison Manuel" }).click();
  await expect(navigation.getByRole("link", { name: "Catalogue" })).toHaveCount(0);

  await page.getByRole("link", { name: "Équipe", exact: true }).click();
  await expect(page).toHaveURL(/\/equipe$/);
  await expect(page.getByRole("heading", { level: 1, name: "Équipe" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Équipe", exact: true })).toHaveAttribute("aria-current", "page");
  // A table: full name, e-mail, role.
  const team = page.getByRole("table", { name: "Membres de l’organisation" });
  await expect(team.getByRole("columnheader")).toHaveText(["Nom complet", "E-mail", "Rôle", "Actions"]);
  await expect(team.getByRole("row").filter({ hasText: "Alice Martin" }).getByRole("cell")).toHaveText([alice.email, "Propriétaire", ""]);
  // The owner invites from the page's button.
  await page.getByRole("button", { name: "Inviter un collègue" }).click();
  await expect(page.getByRole("dialog", { name: "Inviter un collègue" }).getByLabel("Adresse e-mail")).toBeFocused();
  await page.keyboard.press("Escape");

  await page.getByRole("link", { name: "Aide", exact: true }).click();
  await expect(page).toHaveURL(/\/aide$/);
  await expect(page.getByRole("heading", { level: 1, name: "Aide" })).toBeVisible();
  for (const guide of ["Partager une revue", "Qualifier une demande", "Préparer une proposition", "Validation et preuve"])
    await expect(page.getByRole("region", { name: guide })).toBeVisible();
  await expect(page.locator(".shortcuts-list")).toContainText("Ctrl K");
  // The tour replays on a deliverable: none opened yet, said so.
  await expect(page.getByRole("button", { name: "Revoir la visite guidée" })).toBeDisabled();

  // A deliverable opened: the tour replays on it, though already seen.
  await seedReview(alice, unique("tok-aide"));
  await page.goto("/projets/1/livrables/1");
  await expect(page.locator("[data-page]").first()).toBeVisible();
  await page.goto("/aide");
  await page.getByRole("button", { name: "Revoir la visite guidée" }).click();
  await expect(page).toHaveURL(/\/projets\/1\/livrables\/1$/);
  await expect(page.getByRole("dialog", { name: /^Découvrir le livrable/ })).toBeVisible();
  expect(errors).toEqual([]);
});

test("« Partagés avec moi »: my agencies, each opened in a click, and the reviews other agencies invited me to", async ({ browser }) => {
  const alice = await signUp("Alice Martin");
  await createAgency(alice, "Studio Alice");
  const token = unique("tok-partage");
  const { linkKey } = await seedReview(alice, token);
  const bob = await signUp("Bob Martin");
  await createAgency(bob, "Studio Bob");
  // Bob's address invited on Alice's review, as a client.
  expect((await call("/api/review-access/invite", { person: alice, body: { linkKey, emails: [bob.email] } })).status).toBe(200);

  const { page, errors } = await newPerson(browser);
  await signInPage(page, bob.email);
  await page.goto("/partages");
  const agencies = page.getByRole("region", { name: "Mes organisations" });
  await expect(agencies).toContainText("Studio Bob");
  await expect(agencies).toContainText("Organisation actuelle");
  // No word of « agence » left for those who are not one, nor a hint about being invited elsewhere.
  await expect(page.getByRole("main")).not.toContainText(/agence|Invité dans une autre/i);
  const reviews = page.getByRole("list", { name: "Revues partagées avec moi" });
  await expect(reviews.getByRole("listitem")).toHaveCount(1);
  await expect(reviews).toContainText("maquette-1.png V01");
  await expect(reviews).toContainText("Studio Alice · Décideur");
  // Their personal link, as in their invitation e-mail.
  const [invite] = await sql<{ id: string }>("select invite->>'id' as id from review_links, jsonb_array_elements(data->'invites') invite where organization_id = $1 and key = $2", [alice.organizationId, linkKey]);
  await expect(reviews.getByRole("link", { name: /^Ouvrir la revue de maquette-1\.png/ })).toHaveAttribute("href", `/review/${token}${invite?.id ? `?invitation=${invite.id}` : ""}`);

  // Bob joins Alice's agency: one more agency, opened in a click; her review is his agency's, no longer « shared ».
  const member = await call("/api/auth/organization/invite-member", { person: alice, body: { email: bob.email, role: "member", organizationId: alice.organizationId } });
  await call("/api/auth/organization/accept-invitation", { person: bob, body: { invitationId: member.json.id } });
  await page.reload();
  await expect(agencies).toContainText("Studio Alice");
  await expect(agencies.getByRole("button", { name: "Ouvrir" })).toHaveCount(1);
  await expect(page.getByText("Aucune revue partagée avec vous")).toBeVisible();
  expect(errors).toEqual([]);
});

test("the reviews shared with me are read by my own verified address only: never another's, a revoked or an expired one", async () => {
  const alice = await signUp("Alice Martin");
  await createAgency(alice, "Studio Alice");
  const bob = await signUp("Bob Martin");
  await createAgency(bob, "Studio Bob");
  const carol = await signUp("Carole Dupont");
  await createAgency(carol, "Studio Carole");
  const shared = async (person: typeof bob) => (await call("/api/me/reviews", { person })).json.reviews as { deliverable: string }[];

  // Three links inviting Bob: active, revoked, expired.
  const tokens = { active: unique("tok-actif"), revoked: unique("tok-revoque"), expired: unique("tok-expire") };
  await seedReview(alice, tokens.active, { deliverableId: 1 });
  await seedReview(alice, tokens.revoked, { deliverableId: 2 });
  await seedReview(alice, tokens.expired, { deliverableId: 3 });
  for (const linkKey of ["1:1", "2:1", "3:1"]) expect((await call("/api/review-access/invite", { person: alice, body: { linkKey, emails: [bob.email] } })).status).toBe(200);
  const [revoked, expired] = await Promise.all([
    sql<{ data: Record<string, unknown> }>("select data from review_links where organization_id = $1 and key = '2:1'", [alice.organizationId]),
    sql<{ data: Record<string, unknown> }>("select data from review_links where organization_id = $1 and key = '3:1'", [alice.organizationId]),
  ]);
  await seedState(alice, {
    maps: {
      reviewLinks: {
        upsert: { "2:1": { ...revoked[0]!.data, active: false }, "3:1": { ...expired[0]!.data, expiresAt: "01/01/2020", autoExpire: true } },
        remove: [],
      },
    },
  });

  // Bob: the active one only, nothing of who else is invited.
  const seen = await call("/api/me/reviews", { person: bob });
  expect(seen.status).toBe(200);
  expect((seen.json.reviews as { deliverable: string }[]).map((review) => review.deliverable)).toEqual(["maquette-1.png"]);
  expect(JSON.stringify(seen.json)).not.toContain("invites");
  // Carol, not invited: nothing; nobody signed in: refused.
  expect(await shared(carol)).toEqual([]);
  expect((await call("/api/me/reviews", {})).status).toBe(401);
  // The agency's own reviews are not « shared with » its members.
  expect(await shared(alice)).toEqual([]);
});
