// Connecting an agency to Figma (US-054, step 1): its owner or an administrator connects the agency's Figma
// account from « Paramètres de l’agence », by OAuth; the tokens are sealed in the database, never sent to a
// page. A code is only stored for the attempt this member started in this browser: every other way in is
// refused. Figma is the run's stand-in (figmaStandIn.ts); its consent page is intercepted here.

import { expect, test, type Page } from "@playwright/test";
import { addColleague, call, createAgency, newPerson, signInPage, signUp, sql, unique, type Member } from "./helpers";
import { figmaClient } from "./figmaStandIn";
import { baseURL } from "../../playwright.config";

const callback = `${baseURL}/api/integrations/figma/callback`;
const connectionOf = async (org: string) =>
  (await sql<{ handle: string; figma_user_id: string; access_token: string; refresh_token: string }>("select * from figma_connections where organization_id = $1", [org]))[0];

/**
 * Figma's consent page, accepted at once: back to Kora with a code for `handle`, bound to the PKCE challenge
 * Kora sent. Playwright does not intercept a request reached by a redirect, so Kora's answer to « Connecter
 * Figma » is read here (the attempt's cookie lands in the browser) and its address at Figma answered.
 */
async function figmaAccepts(page: Page, handle: string) {
  const asked: URL[] = [];
  await page.route("**/api/integrations/figma/connect", async (route) => {
    const kora = await route.fetch({ maxRedirects: 0 });
    const consent = new URL(kora.headers().location);
    asked.push(consent);
    const back = new URL(consent.searchParams.get("redirect_uri")!);
    back.search = new URLSearchParams({ code: `ok:${handle}:${consent.searchParams.get("code_challenge")}`, state: consent.searchParams.get("state")! }).toString();
    await route.fulfill({ status: 302, headers: { location: back.toString(), "set-cookie": kora.headers()["set-cookie"] } });
  });
  return asked;
}

async function openAgencySettings(page: Page, name: string) {
  await page.getByRole("button", { name: `Compte de ${name}` }).first().click();
  await page.getByRole("menu").getByRole("menuitem", { name: "Paramètres de l’agence" }).click();
  return page.getByRole("dialog", { name: "Paramètres de l’agence" });
}

/** Starts an attempt through the API: Figma's address Kora sends to, and the attempt's cookie. */
async function startAttempt(member: Member) {
  const started = await call("/api/integrations/figma/connect", { person: member });
  expect(started.status).toBe(307);
  const figma = new URL(started.response.headers.get("location")!);
  const attempt = started.response.headers.getSetCookie().find((cookie) => cookie.startsWith("kora_figma_attempt="))!.split(";")[0];
  return { figma, attempt, state: figma.searchParams.get("state")!, challenge: figma.searchParams.get("code_challenge")! };
}

const finish = (member: Member, query: Record<string, string>, attempt = "") =>
  call(`/api/integrations/figma/callback?${new URLSearchParams(query)}`, { person: { ...member, cookie: [member.cookie, attempt].filter(Boolean).join("; ") } });

const outcomeOf = (response: Response) => new URL(response.headers.get("location")!).searchParams.get("figma");

test("the owner connects Figma from the agency settings, sees the account, and disconnects it", async ({ browser }) => {
  const owner = await signUp("Alice Martin");
  const org = await createAgency(owner, "Studio Figma");
  const handle = unique("studio");

  const { page, errors } = await newPerson(browser);
  await signInPage(page, owner.email);
  const asked = await figmaAccepts(page, handle);
  let dialog = await openAgencySettings(page, "Alice Martin");
  await expect(dialog.getByRole("heading", { name: "Figma" })).toBeVisible();
  await dialog.getByRole("button", { name: "Connecter Figma" }).click();

  // Back in Kora, connected.
  await expect(page.getByText("Figma est connecté")).toBeVisible();
  await expect(page).not.toHaveURL(/figma=/);
  const consent = asked[0];
  expect(consent.searchParams.get("client_id")).toBe(figmaClient.id);
  expect(consent.searchParams.get("redirect_uri")).toBe(callback);
  expect(consent.searchParams.get("response_type")).toBe("code");
  expect(consent.searchParams.get("code_challenge_method")).toBe("S256");
  expect(consent.searchParams.get("scope")!.split(" ")).toEqual(expect.arrayContaining(["file_comments:read", "file_comments:write", "file_versions:read"]));

  // Stored for the agency, the tokens sealed: neither readable in the database nor sent to the page.
  const stored = await connectionOf(org);
  expect(stored).toMatchObject({ handle, figma_user_id: `fig-${handle}` });
  expect(stored.access_token).toMatch(/^v1\./);
  expect(stored.access_token).not.toContain("figma-access");
  expect(stored.refresh_token).not.toContain("figma-refresh");
  const status = await call("/api/integrations/figma", { person: owner });
  expect(status.json).toMatchObject({ available: true, canManage: true, connection: { handle, connectedBy: "Alice Martin" } });
  expect(JSON.stringify(status.json)).not.toMatch(/figma-access|figma-refresh|v1\./);

  dialog = await openAgencySettings(page, "Alice Martin");
  await expect(dialog).toContainText(`Connecté au compte Figma ${handle}, par Alice Martin`);
  await dialog.getByRole("button", { name: "Déconnecter Figma" }).click();
  await expect(dialog.getByRole("button", { name: "Connecter Figma" })).toBeVisible();
  await expect.poll(() => connectionOf(org)).toBeUndefined();
  expect(errors).toEqual([]);
});

test("a member cannot connect or disconnect Figma; without a session, nothing is said", async () => {
  const owner = await signUp("Alice Martin");
  const org = await createAgency(owner, "Studio Rôles");
  const member = await addColleague(owner, "Bruno Petit", "member");

  const started = await call("/api/integrations/figma/connect", { person: member });
  expect(outcomeOf(started.response)).toBe("forbidden");
  expect(started.response.headers.getSetCookie().join()).not.toContain("kora_figma_attempt");
  expect((await call("/api/integrations/figma", { person: member })).json).toMatchObject({ canManage: false, connection: null });

  // The owner connects; the member can neither disconnect it nor finish an attempt of their own.
  const attempt = await startAttempt(owner);
  expect(outcomeOf((await finish(owner, { code: `ok:${unique("roles")}:${attempt.challenge}`, state: attempt.state }, attempt.attempt)).response)).toBe("connected");
  const refused = await call("/api/integrations/figma", { method: "DELETE", person: member });
  expect(refused.status).toBe(403);
  expect(await connectionOf(org)).toBeDefined();

  expect((await call("/api/integrations/figma")).status).toBe(401);
  expect((await call("/api/integrations/figma/connect")).status).toBe(401);
});

test("a code is stored only for the attempt this member started in this browser", async () => {
  const owner = await signUp("Alice Martin");
  const org = await createAgency(owner, "Studio Garde");
  const other = await signUp("Oscar Autre");
  const otherOrg = await createAgency(other, "Studio Autre");
  const code = (attempt: { challenge: string }) => `ok:${unique("garde")}:${attempt.challenge}`;

  // Without this browser's cookie (a link opened elsewhere), or with a state altered: nothing.
  const attempt = await startAttempt(owner);
  expect(outcomeOf((await finish(owner, { code: code(attempt), state: attempt.state })).response)).toBe("invalid");
  expect(outcomeOf((await finish(owner, { code: code(attempt), state: `${attempt.state}x` }, attempt.attempt)).response)).toBe("invalid");
  // Another agency's member with this attempt (its state and its cookie): nothing, in either agency.
  expect(outcomeOf((await finish(other, { code: code(attempt), state: attempt.state }, attempt.attempt)).response)).toBe("invalid");
  // Figma refuses the code (unknown, or not bound to this attempt's PKCE verifier): nothing.
  expect(outcomeOf((await finish(owner, { code: "inconnu", state: attempt.state }, attempt.attempt)).response)).toBe("refused");
  const someoneElses = await startAttempt(other);
  expect(outcomeOf((await finish(owner, { code: code(someoneElses), state: attempt.state }, attempt.attempt)).response)).toBe("refused");
  expect(await connectionOf(org)).toBeUndefined();
  expect(await connectionOf(otherOrg)).toBeUndefined();

  // The attempt itself still works, and its cookie is spent.
  const done = await finish(owner, { code: code(attempt), state: attempt.state }, attempt.attempt);
  expect(outcomeOf(done.response)).toBe("connected");
  expect(done.response.headers.getSetCookie().join()).toMatch(/kora_figma_attempt=;/);
  expect(await connectionOf(org)).toBeDefined();
  expect(await connectionOf(otherOrg)).toBeUndefined();
});
