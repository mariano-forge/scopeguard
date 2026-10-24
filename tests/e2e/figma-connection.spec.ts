// Connecting a member's Figma account (US-054, step 1): each member of an agency connects their own Figma
// account from « Compte Figma » in the account menu, by OAuth; the tokens are sealed in the database, never
// sent to a page. A code is only stored for the attempt this member started in this browser: every other
// way in is refused. Figma is the run's stand-in (figmaStandIn.ts); its consent page is intercepted here.

import { expect, test, type Page } from "@playwright/test";
import { addColleague, call, createAgency, newPerson, signInPage, signUp, sql, unique, type Member } from "./helpers";
import { figmaClient } from "./figmaStandIn";
import { baseURL } from "../../playwright.config";

const callback = `${baseURL}/api/integrations/figma/callback`;
type Row = { user_id: string; handle: string; figma_user_id: string; access_token: string; refresh_token: string };
const connectionsOf = (org: string) => sql<Row>("select * from figma_connections where organization_id = $1 order by handle", [org]);
const connectionOf = async (org: string) => (await connectionsOf(org))[0];
const userIdOf = async (email: string) => (await sql<{ id: string }>("select id from users where email = $1", [email]))[0].id;

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

async function openFigmaAccount(page: Page, name: string) {
  await page.getByRole("button", { name: `Compte de ${name}` }).first().click();
  await page.getByRole("menu").getByRole("menuitem", { name: "Compte Figma" }).click();
  return page.getByRole("dialog", { name: "Compte Figma" });
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

test("a member connects their own Figma account from the account menu, sees it, and disconnects it", async ({ browser }) => {
  const owner = await signUp("Alice Martin");
  const org = await createAgency(owner, "Studio Figma");
  const member = await addColleague(owner, "Bruno Petit", "member");
  const handle = unique("bruno");

  const { page, errors } = await newPerson(browser);
  await signInPage(page, member.email);
  const asked = await figmaAccepts(page, handle);
  let dialog = await openFigmaAccount(page, "Bruno Petit");
  await dialog.getByRole("button", { name: "Connecter mon compte Figma" }).click();

  // Back in Kora, connected.
  await expect(page.getByText("Votre compte Figma est connecté")).toBeVisible();
  await expect(page).not.toHaveURL(/figma=/);
  const consent = asked[0];
  expect(consent.searchParams.get("client_id")).toBe(figmaClient.id);
  expect(consent.searchParams.get("redirect_uri")).toBe(callback);
  expect(consent.searchParams.get("response_type")).toBe("code");
  expect(consent.searchParams.get("code_challenge_method")).toBe("S256");
  expect(consent.searchParams.get("scope")!.split(" ")).toEqual(expect.arrayContaining(["file_comments:read", "file_comments:write", "file_versions:read"]));

  // Stored as the member's, the tokens sealed: neither readable in the database nor sent to the page.
  const stored = await connectionOf(org);
  expect(stored).toMatchObject({ user_id: await userIdOf(member.email), handle, figma_user_id: `fig-${handle}` });
  expect(stored.access_token).toMatch(/^v1\./);
  expect(stored.access_token).not.toContain("figma-access");
  expect(stored.refresh_token).not.toContain("figma-refresh");
  const status = await call("/api/integrations/figma", { person: member });
  expect(status.json).toMatchObject({ available: true, connection: { handle } });
  expect(JSON.stringify(status.json)).not.toMatch(/figma-access|figma-refresh|v1\./);

  dialog = await openFigmaAccount(page, "Bruno Petit");
  await expect(dialog).toContainText(`Connecté au compte Figma ${handle}`);
  await dialog.getByRole("button", { name: "Déconnecter mon compte Figma" }).click();
  await expect(dialog.getByRole("button", { name: "Connecter mon compte Figma" })).toBeVisible();
  await expect.poll(() => connectionOf(org)).toBeUndefined();
  expect(errors).toEqual([]);
});

test("each member has their own connection: sees only theirs, disconnects only theirs; one Figma account serves one member", async () => {
  const owner = await signUp("Alice Martin");
  const org = await createAgency(owner, "Studio Comptes");
  const member = await addColleague(owner, "Bruno Petit", "member");
  const [alice, bruno] = [unique("alice"), unique("bruno")];
  const connect = async (person: Member, handle: string) => {
    const attempt = await startAttempt(person);
    return outcomeOf((await finish(person, { code: `ok:${handle}:${attempt.challenge}`, state: attempt.state }, attempt.attempt)).response);
  };
  expect(await connect(owner, alice)).toBe("connected");
  expect(await connect(member, bruno)).toBe("connected");
  expect((await call("/api/integrations/figma", { person: owner })).json).toMatchObject({ connection: { handle: alice } });
  expect((await call("/api/integrations/figma", { person: member })).json).toMatchObject({ connection: { handle: bruno } });

  // Bruno disconnects his: Alice's stays.
  expect((await call("/api/integrations/figma", { method: "DELETE", person: member })).status).toBe(200);
  expect((await connectionsOf(org)).map((row) => row.handle)).toEqual([alice]);
  expect((await call("/api/integrations/figma", { person: member })).json).toMatchObject({ connection: null });

  // Bruno connects Alice's Figma account: Figma keeps one live token per account, so hers goes.
  expect(await connect(member, alice)).toBe("connected");
  const rows = await connectionsOf(org);
  expect(rows.map((row) => [row.handle, row.user_id])).toEqual([[alice, await userIdOf(member.email)]]);

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
  // Another agency's member, or a colleague, with this attempt (its state and its cookie): nothing.
  expect(outcomeOf((await finish(other, { code: code(attempt), state: attempt.state }, attempt.attempt)).response)).toBe("invalid");
  const colleague = await addColleague(owner, "Bruno Petit", "admin");
  expect(outcomeOf((await finish(colleague, { code: code(attempt), state: attempt.state }, attempt.attempt)).response)).toBe("invalid");
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
