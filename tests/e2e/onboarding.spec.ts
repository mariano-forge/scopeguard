// A new agency's first steps: its first space, project and colleagues (/demarrer), a project that
// always lands in a space, and « Bien démarrer » on the home page until the first client review.

import { expect, test } from "@playwright/test";
import { createAgency, newPerson, seedState, signInPage, signUp, sql, waitForMail } from "./helpers";

const rows = <T,>(query: string, org: string) => sql<T>(query, [org]);

test("the first steps create the agency's first space and project, go back to correct them, invite colleagues, then open the project", async ({ browser }) => {
  const owner = await signUp("Ines Garnier");
  const org = await createAgency(owner, "Studio Garnier");
  const { page, errors } = await newPerson(browser);
  await signInPage(page, owner.email);
  await page.goto("/demarrer");
  const next = page.getByRole("button", { name: "Suivant" });
  const back = page.getByRole("button", { name: "Retour" });

  // One question per screen, no illustration; « Suivant » waits for an answer.
  await expect(page.getByText("Étape 2 sur 4 · Espace")).toBeVisible();
  await expect(page.locator(".auth-shot")).toHaveCount(0);
  await expect(next).toBeDisabled();
  // A space is not only a client: an internal team too.
  await page.getByLabel("Nom de l’espace").fill("Marketing");
  await next.click();
  await expect(page.getByRole("heading", { name: "Nommez votre premier projet" })).toBeVisible();
  await expect(page.getByText("Une mission pour Marketing")).toBeVisible();
  await page.getByLabel("Nom du projet").fill("Site vitrine");
  await next.click();
  await expect(page.getByRole("heading", { name: "Invitez vos collègues" })).toBeVisible();

  // « Retour » brings back what was typed, and correcting it renames: no second project, no second space.
  await back.click();
  await expect(page.getByLabel("Nom du projet")).toHaveValue("Site vitrine");
  await page.getByLabel("Nom du projet").fill("Site vitrine 2027");
  await back.click();
  await expect(page.getByLabel("Nom de l’espace")).toHaveValue("Marketing");
  await back.click();
  await expect(page.getByLabel("Nom de votre agence")).toHaveValue("Studio Garnier");
  await page.getByLabel("Nom de votre agence").fill("Studio Garnier & Co");
  await next.click();
  await page.getByLabel("Nom de l’espace").fill("Marketing digital");
  await next.click();
  // What was typed before going back is still there.
  await expect(page.getByLabel("Nom du projet")).toHaveValue("Site vitrine 2027");
  await next.click();
  await expect(page.getByRole("heading", { name: "Invitez vos collègues" })).toBeVisible();
  await expect.poll(async () => (await rows<{ name: string }>("select name from organizations where id = $1", org))[0]?.name).toBe("Studio Garnier & Co");

  // A reload starts at the first step not done.
  await page.reload();
  await expect(page.getByRole("heading", { name: "Invitez vos collègues" })).toBeVisible();
  // The client comes later, with a deliverable.
  await expect(page.getByText("Vous l’inviterez plus tard, en partageant un livrable")).toBeVisible();
  // The fields' heading stands above the first field, not under it.
  const legend = (await page.getByText("E-mails de vos collègues").boundingBox())!;
  const firstField = (await page.getByRole("textbox", { name: "E-mail du collègue 1" }).boundingBox())!;
  expect(legend.y + legend.height).toBeLessThanOrEqual(firstField.y);

  // Several colleagues at once; a wrong address stops everything before any invitation leaves.
  const stamp = Date.now();
  const [lou, max, eva] = ["lou", "max", "eva"].map((name) => `${name}-${stamp}@agence.test`);
  await page.getByRole("textbox", { name: "E-mail du collègue 1" }).fill(lou);
  await page.getByRole("textbox", { name: "E-mail du collègue 2" }).fill("pas-une-adresse");
  await page.getByRole("button", { name: "Ajouter une adresse" }).click();
  await page.getByRole("textbox", { name: "E-mail du collègue 3" }).fill(eva);
  await page.getByRole("button", { name: "Inviter et terminer" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "pas-une-adresse" })).toContainText("ne semble pas être une adresse e-mail valide");
  expect(await rows("select 1 from invitations where organization_id = $1", org)).toHaveLength(0);
  await page.getByRole("textbox", { name: "E-mail du collègue 2" }).fill(max);
  await page.getByRole("button", { name: "Inviter et terminer" }).click();

  // Sent, then into the project just created.
  await page.waitForURL(/\/projets\/\d+$/);
  for (const colleague of [lou, max, eva]) await waitForMail(colleague, "vous invite à rejoindre Studio Garnier & Co");
  const invited = await rows<{ email: string; role: string }>("select email, role from invitations where organization_id = $1 order by email", org);
  expect(invited).toEqual([eva, lou, max].map((email) => ({ email, role: "member" })));
  const spaces = await rows<{ data: Record<string, unknown> }>("select data from clients where organization_id = $1", org);
  expect(spaces.map((space) => space.data)).toEqual([expect.objectContaining({ name: "Marketing digital" })]);
  const projects = await rows<{ data: Record<string, unknown> }>("select data from projects where organization_id = $1", org);
  expect(projects.map((project) => project.data)).toEqual([expect.objectContaining({ name: "Site vitrine 2027", clientId: Number(spaces[0].data.id) })]);
  expect(errors).toEqual([]);
});

test("skipping the first steps leads home, where « Bien démarrer » takes over; a project still needs a space", async ({ browser }) => {
  const owner = await signUp("Jules Morel");
  const org = await createAgency(owner, "Atelier Morel");
  const { page, errors } = await newPerson(browser);
  await signInPage(page, owner.email);
  await page.goto("/demarrer");
  // No space, so no project: straight to the team.
  await page.getByRole("button", { name: "Passer" }).click();
  await expect(page.getByRole("heading", { name: "Invitez vos collègues" })).toBeVisible();
  // Nothing typed: « Terminer » leaves without inviting anyone.
  await page.getByRole("button", { name: "Terminer" }).click();
  await page.waitForURL((url) => url.pathname === "/");
  expect(await rows("select 1 from invitations where organization_id = $1", org)).toHaveLength(0);

  const list = page.getByRole("region", { name: "Bien démarrer" });
  await expect(list).toContainText("1 sur 5");
  // The key figures stay side by side without overlapping, on a laptop screen too.
  for (const width of [1100, 1400]) {
    await page.setViewportSize({ width, height: 800 });
    const hero = (await page.locator(".hero-stat").boundingBox())!;
    const firstTile = (await page.locator(".stat-tile").first().boundingBox())!;
    expect(hero.x + hero.width).toBeLessThanOrEqual(firstTile.x);
  }
  await expect(list.getByRole("button", { name: "Créer un espace" })).toBeVisible();

  // « + Projet » with no space yet: the dialog asks for the space, and creates both.
  await page.getByRole("button", { name: "Ajouter un projet" }).click();
  const dialog = page.getByRole("dialog", { name: "Créer un projet" });
  await expect(dialog.getByRole("combobox")).toHaveCount(0);
  await dialog.getByLabel("Nom du projet").fill("Catalogue");
  await dialog.getByRole("button", { name: "Créer le projet" }).click();
  await expect(dialog.getByRole("alert")).toHaveText("Donnez un nom à l’espace.");
  await dialog.getByLabel("Espace", { exact: true }).fill("Librairie Ombre");
  await dialog.getByRole("button", { name: "Créer le projet" }).click();
  await page.waitForURL(/\/projets\/\d+$/);
  const [space] = await rows<{ id: number }>("select id from clients where organization_id = $1 and data->>'name' = 'Librairie Ombre'", org);
  expect(space).toBeDefined();
  await expect
    .poll(async () => (await rows<{ data: Record<string, unknown> }>("select data from projects where organization_id = $1", org)).map((project) => project.data))
    .toEqual([expect.objectContaining({ name: "Catalogue", clientId: Number(space.id) })]);

  // Back home: space and project are ticked, the next step is the deliverable.
  await page.goto("/");
  await expect(list).toContainText("3 sur 5");
  await expect(list.getByRole("button", { name: "Importer un livrable" })).toBeVisible();
  // Hidden by the member: it stays hidden.
  await list.getByRole("button", { name: "Masquer « Bien démarrer »" }).click();
  await expect(list).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Vue d’ensemble" })).toBeVisible();
  await expect(list).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("« Bien démarrer » leaves once a version is shared with the client; a member without the right to invite skips the team", async ({ browser }) => {
  const owner = await signUp("Leon Faure");
  const org = await createAgency(owner, "Studio Faure");
  await seedState(owner, {
    lists: {
      clients: { upsert: [{ id: 1, name: "Northwind" }], remove: [] },
      projects: { upsert: [{ id: 1, name: "Refonte", clientId: 1, client: "Northwind", status: "En cours" }], remove: [] },
      deliverables: { upsert: [{ id: 1, projectId: 1, name: "maquette.png", type: "Image", version: 1, status: "En attente client", locked: false, importedAt: "14/10/2026 10:00" }], remove: [] },
    },
  });
  const { page, errors } = await newPerson(browser);
  await signInPage(page, owner.email);
  const list = page.getByRole("region", { name: "Bien démarrer" });
  await expect(list).toContainText("4 sur 5");
  await expect(list.getByRole("link", { name: "Partager la revue" })).toHaveAttribute("href", "/projets/1/livrables/1?partage=1");

  await seedState(owner, {
    maps: { reviewLinks: { upsert: { "1:1": { token: "t-faure", active: true, expiresAt: "2099-01-01", deliverableId: 1, version: 1, invites: [{ email: "claire@northwind.test", at: "14/10/2026 10:00" }] } }, remove: [] } },
  });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Vue d’ensemble" })).toBeVisible();
  await expect(list).toHaveCount(0);

  // Everything is set up and only owners and administrators invite: /demarrer has nothing left for a member.
  const [member] = await sql<{ id: string }>("select id from members where organization_id = $1", [org]);
  await sql("update members set role = 'member' where id = $1", [member.id]);
  await page.goto("/demarrer");
  await page.waitForURL((url) => url.pathname === "/");
  expect(errors).toEqual([]);
});
