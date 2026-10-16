// Shared steps of the end-to-end tests: accounts and agencies through the API, mails from the outbox,
// verified clients, and direct reads of the test database.

import { readFileSync } from "node:fs";
import type { Browser, Page } from "@playwright/test";
import { drizzle } from "drizzle-orm/node-postgres";
import { Client } from "pg";
import type { Db } from "../../src/db/client";
import * as schema from "../../src/db/schema";
import { applyChanges } from "../../src/db/state";
import type { StateChanges } from "../../src/lib/sharedState";
import { baseURL, mailOutbox, testDatabaseUrl } from "../../playwright.config";

export const PASSWORD = "mot-de-passe-solide";

let counter = 0;
/** "alice-k3x9" : names and addresses never collide between tests of the same run. */
export const unique = (prefix: string) => `${prefix}-${Date.now().toString(36)}${(counter++).toString(36)}`;
/** One address per simulated person: sign-in limits are counted per address (TRUSTED_PROXY_HOPS=1). */
export const newIp = () => `198.51.${100 + Math.floor(counter / 250)}.${(counter++ % 250) + 1}`;

export type Person = { cookie: string; ip: string };

export function headers(person?: Partial<Person>) {
  return { "content-type": "application/json", origin: baseURL, cookie: person?.cookie ?? "", "x-forwarded-for": person?.ip ?? newIp() };
}

export async function call(path: string, options: { method?: string; person?: Partial<Person>; body?: unknown; redirect?: RequestRedirect } = {}) {
  const response = await fetch(baseURL + path, {
    method: options.method ?? (options.body === undefined ? "GET" : "POST"),
    headers: headers(options.person),
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    redirect: options.redirect ?? "manual",
  });
  const text = await response.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: response.status, json: json as Record<string, unknown> & { error?: string }, response };
}

const cookiesOf = (response: Response) =>
  response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");

// ——— Agency members ———

export type Member = Person & { email: string; name: string; organizationId?: string };

/** A new account, its address confirmed through the mailed link (which opens the session). */
export async function signUp(name: string, email = `${unique(name.split(" ")[0].toLowerCase())}@agence.test`): Promise<Member> {
  const ip = newIp();
  const response = await fetch(`${baseURL}/api/auth/sign-up/email`, { method: "POST", headers: headers({ ip }), body: JSON.stringify({ name, email, password: PASSWORD }) });
  if (!response.ok) throw new Error(`sign-up ${email}: ${response.status}`);
  const link = linkIn(await waitForMail(email, "Confirmez votre adresse"));
  const confirmed = await fetch(link!, { headers: headers({ ip }), redirect: "manual" });
  await confirmed.arrayBuffer();
  const cookie = cookiesOf(confirmed);
  if (!cookie.includes("session_token")) throw new Error(`confirmation of ${email}: no session (${confirmed.status})`);
  return { cookie, ip, email, name };
}

export async function createAgency(owner: Member, name: string) {
  const created = await call("/api/auth/organization/create", { person: owner, body: { name, slug: unique(name.toLowerCase().replace(/\W+/g, "-")) } });
  const organizationId = created.json.id as string;
  await call("/api/auth/organization/set-active", { person: owner, body: { organizationId } });
  owner.organizationId = organizationId;
  return organizationId;
}

/** A colleague invited by `owner` with `role`, who accepts and works in the agency. */
export async function addColleague(owner: Member, name: string, role: "member" | "admin") {
  const colleague = await signUp(name);
  const invitation = await call("/api/auth/organization/invite-member", { person: owner, body: { email: colleague.email, role, organizationId: owner.organizationId } });
  await call("/api/auth/organization/accept-invitation", { person: colleague, body: { invitationId: invitation.json.id } });
  await call("/api/auth/organization/set-active", { person: colleague, body: { organizationId: owner.organizationId } });
  colleague.organizationId = owner.organizationId;
  return colleague;
}

export const changes = (partial: Record<string, unknown>) => ({ lists: {}, maps: {}, settings: { upsert: {}, remove: [] }, ...partial });

/**
 * Test setup: writes records of the member's agency straight into the test database, the way the
 * server's action routes do (applyChanges, src/db/state.ts). Pages and clients then read them back.
 */
export async function seedState(member: Member, partial: Record<string, unknown>) {
  if (!member.organizationId) throw new Error(`seedState: ${member.email} has no agency`);
  const client = new Client({ connectionString: testDatabaseUrl });
  await client.connect();
  try {
    await applyChanges(drizzle(client, { schema }) as unknown as Db, member.organizationId, changes(partial) as StateChanges, { recordedBy: "test-setup" });
  } finally {
    await client.end();
  }
}

export async function readState(member: Person) {
  return (await call("/api/state", { person: member })).json.state as Record<string, unknown>;
}

/** A space, a project and a deliverable version with an active review link `token`. */
export async function seedReview(member: Member, token: string, extra: { deliverableId?: number; version?: number } = {}) {
  const deliverableId = extra.deliverableId ?? 1;
  const version = extra.version ?? 1;
  const linkKey = `${deliverableId}:${version}`;
  await seedState(member, {
    lists: {
      clients: { upsert: [{ id: 1, name: "Northwind" }], remove: [] },
      projects: { upsert: [{ id: 1, name: "Refonte", clientId: 1, client: "Northwind", status: "En cours" }], remove: [] },
      deliverables: { upsert: [{ id: deliverableId, projectId: 1, name: `maquette-${deliverableId}.png`, type: "Image", version, status: "En attente client", locked: false }], remove: [] },
    },
    maps: { reviewLinks: { upsert: { [linkKey]: { token, active: true, expiresAt: "01/01/2099", autoExpire: true, deliverableId, version } }, remove: [] } },
  });
  return { linkKey, deliverableId, version };
}

// ——— Mails (written to the outbox by MAIL_TRANSPORT=console) ———

export type SentMail = { to: string; replyTo: string | null; subject: string; text: string };

export function mails(): SentMail[] {
  return readFileSync(mailOutbox, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

export const mailsTo = (to: string) => mails().filter((mail) => mail.to === to);
export const lastMailTo = (to: string) => mailsTo(to).at(-1);

/** The 6 digits of the last code sent to `email`. */
export function codeFor(email: string) {
  const code = mailsTo(email)
    .map((mail) => /^(\d{6}) est votre code/.exec(mail.subject)?.[1])
    .filter(Boolean)
    .at(-1);
  if (!code) throw new Error(`no code mailed to ${email}`);
  return code;
}

/** Waits for the last mail to `email` whose subject contains `subject` (written just after the server answers). */
export async function waitForMail(email: string, subject: string, timeout = 5000) {
  const until = Date.now() + timeout;
  for (;;) {
    const mail = mailsTo(email).filter((candidate) => candidate.subject.includes(subject)).at(-1);
    if (mail) return mail;
    if (Date.now() > until) throw new Error(`no mail "${subject}" to ${email}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

/** Waits for a code mail to `email` (written just after the server answers), then its 6 digits. */
export async function waitForCode(email: string, timeout = 5000) {
  const until = Date.now() + timeout;
  for (;;) {
    try {
      return codeFor(email);
    } catch (error) {
      if (Date.now() > until) throw error;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
}

/** The first address of the app in a mail. */
export const linkIn = (mail: SentMail | undefined) => /(https?:\/\/\S+)/.exec(mail?.text ?? "")?.[1] ?? null;

// ——— Clients of a review ———

/** A client verified on a device: code by mail, then their name (first verification). */
export async function verifiedClient(token: string, email: string, name = "Claire Dubois"): Promise<Person> {
  const ip = newIp();
  await call(`/api/review/${token}/access/code`, { person: { ip }, body: { email } });
  const verify = await fetch(`${baseURL}/api/review/${token}/access/verify`, { method: "POST", headers: headers({ ip }), body: JSON.stringify({ email, code: await waitForCode(email) }) });
  if (!verify.ok) throw new Error(`verify ${email}: ${verify.status}`);
  const person = { cookie: cookiesOf(verify), ip };
  await call(`/api/review/${token}/access/profile`, { person, body: { name } });
  return person;
}

/** One client action on a review (routes under /api/review/:token/, src/db/reviewActions.ts). */
export async function clientAction(person: Partial<Person>, token: string, path: string, method: "POST" | "PATCH" | "DELETE" = "POST", body?: Record<string, unknown>) {
  return call(`/api/review/${token}/${path}`, { method, person, body: body ?? (method === "DELETE" ? undefined : {}) });
}

// ——— Database ———

export async function sql<T = Record<string, unknown>>(query: string, params: unknown[] = []) {
  const client = new Client({ connectionString: testDatabaseUrl });
  await client.connect();
  try {
    return (await client.query(query, params)).rows as T[];
  } finally {
    await client.end();
  }
}

// ——— Browser ———

/** A browser context of its own (cookies, address), like another person on another device. */
export async function newPerson(browser: Browser) {
  const context = await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": newIp() }, viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  // Anything the Content Security Policy blocks fails the test: the policy must never break a page.
  page.on("console", (message) => {
    if (/Content Security Policy|Refused to (load|connect|execute|frame)/i.test(message.text())) errors.push(message.text());
  });
  return { page, errors };
}

export async function signInPage(page: Page, email: string) {
  await page.goto("/connexion");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Mot de passe").fill(PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/connexion"));
}

// ——— Files ———

/** A small valid PDF of `pages` pages showing `label`, built here so tests need no file on disk. */
export function makePdf(label: string, pages = 1) {
  const objects: string[] = [];
  const pageIds = Array.from({ length: pages }, (_, index) => 4 + index * 2);
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages} >>`;
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  pageIds.forEach((id, index) => {
    const stream = `BT /F1 24 Tf 72 720 Td (${label} - page ${index + 1}) Tj ET`;
    objects[id] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${id + 1} 0 R >>`;
    objects[id + 1] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  });
  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (let id = 1; id < objects.length; id++) {
    offsets[id] = body.length;
    body += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xref = body.length;
  body += `xref\n0 ${objects.length}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}`;
  body += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, "latin1");
}

/** Uploads a file through POST /api/files, as the agency page does. */
export async function upload(member: Person, content: Buffer, name: string, placement: Record<string, string | number>) {
  const form = new FormData();
  form.set("file", new Blob([new Uint8Array(content)], { type: name.endsWith(".pdf") ? "application/pdf" : "application/octet-stream" }), name);
  for (const [key, value] of Object.entries(placement)) form.set(key, String(value));
  const response = await fetch(`${baseURL}/api/files`, { method: "POST", headers: { cookie: member.cookie, "x-forwarded-for": member.ip }, body: form });
  return { status: response.status, json: (await response.json()) as { href?: string; sha256?: string; error?: string } };
}
