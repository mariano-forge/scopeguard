// « Paramètres de l’agence », from the account menu: its owner renames the agency; a member cannot, on
// the page or through the API.

import { expect, test } from "@playwright/test";
import { addColleague, call, createAgency, newPerson, signInPage, signUp, sql } from "./helpers";

const agencyName = async (org: string) => (await sql<{ name: string }>("select name from organizations where id = $1", [org]))[0]?.name;

test("the owner renames the agency from the account menu; a member is refused", async ({ browser }) => {
  const owner = await signUp("Alice Martin");
  const org = await createAgency(owner, "Studio Avant");
  const member = await addColleague(owner, "Bruno Petit", "member");

  const { page, errors } = await newPerson(browser);
  await signInPage(page, owner.email);
  await page.getByRole("button", { name: "Compte de Alice Martin" }).first().click();
  const menu = page.getByRole("menu");
  await expect(menu).toContainText(owner.email);
  // The organization one works in, said as such.
  await expect(menu).toContainText("Connecté à Studio Avant");
  await menu.getByRole("menuitem", { name: "Paramètres de l’organisation" }).click();
  const dialog = page.getByRole("dialog", { name: "Paramètres de l’organisation" });
  await dialog.getByLabel("Nom de l’organisation").fill("Studio Après");
  await dialog.getByRole("button", { name: "Enregistrer" }).click();
  await expect.poll(() => agencyName(org)).toBe("Studio Après");
  await expect(dialog).toHaveCount(0);

  // A member: no entry in the menu, and the server refuses the change.
  const refused = await call("/api/auth/organization/update", { person: member, body: { organizationId: org, data: { name: "Piraté" } } });
  expect(refused.status).toBeGreaterThanOrEqual(400);
  expect(await agencyName(org)).toBe("Studio Après");
  const other = await newPerson(browser);
  await signInPage(other.page, member.email);
  await other.page.getByRole("button", { name: "Compte de Bruno Petit" }).first().click();
  await expect(other.page.getByRole("menu").getByRole("menuitem", { name: "Équipe" })).toBeVisible();
  await expect(other.page.getByRole("menuitem", { name: "Paramètres de l’organisation" })).toHaveCount(0);
  expect(errors).toEqual([]);
  expect(other.errors).toEqual([]);
});
