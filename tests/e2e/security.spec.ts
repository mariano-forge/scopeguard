// HTTP protections: security headers, writes from other sites, request limits, retired routes.

import { expect, test } from "@playwright/test";
import { baseURL } from "../../playwright.config";
import { call, createAgency, makePdf, newIp, seedState, signUp, upload } from "./helpers";

test("every page and API answer carries the security headers, and does not name the framework", async () => {
  for (const path of ["/", "/connexion", "/api/state", "/review/inconnu"]) {
    const { response } = await call(path);
    const headers = response.headers;
    expect(headers.get("x-powered-by"), path).toBeNull();
    expect(headers.get("x-frame-options"), path).toBe("DENY");
    expect(headers.get("x-content-type-options"), path).toBe("nosniff");
    expect(headers.get("referrer-policy"), path).toBe("strict-origin-when-cross-origin");
    expect(headers.get("permissions-policy"), path).toContain("camera=()");
    const csp = headers.get("content-security-policy") ?? "";
    expect(csp, path).toContain("frame-ancestors 'none'");
    expect(csp, path).toContain("object-src 'none'");
    expect(csp, path).toContain("default-src 'self'");
  }
});

test("writes coming from another site's page are refused", async () => {
  const alice = await signUp("Alice Martin");
  await createAgency(alice, "Studio Origine");
  const evil = { "content-type": "application/json", origin: "https://evil.example", cookie: alice.cookie, "x-forwarded-for": newIp() };
  expect((await fetch(`${baseURL}/api/spaces`, { method: "POST", headers: evil, body: JSON.stringify({ name: "Piégé" }) })).status).toBe(403);
  expect((await fetch(`${baseURL}/api/review/inconnu/access/code`, { method: "POST", headers: evil, body: "{}" })).status).toBe(403);

  const form = new FormData();
  form.set("file", new Blob([new Uint8Array(makePdf("x"))], { type: "application/pdf" }), "x.pdf");
  for (const [key, value] of Object.entries({ kind: "version", projectId: "1", livrableId: "1", version: "1" })) form.set(key, value);
  expect((await fetch(`${baseURL}/api/files`, { method: "POST", headers: { origin: "https://evil.example", cookie: alice.cookie }, body: form })).status).toBe(403);

  // Same requests from the app itself go through.
  expect((await call("/api/spaces", { person: alice, body: { name: "Légitime" } })).status).toBe(200);
});

test("request limits: uploads per hour and saves per minute (lowered for tests)", async () => {
  const alice = await signUp("Alice Martin");
  await createAgency(alice, "Studio Limites");
  const place = { kind: "version", projectId: 1, livrableId: 1, version: 1 };
  const uploads: number[] = [];
  for (let index = 0; index < 6; index++) uploads.push((await upload(alice, makePdf(`fichier ${index}`), `f${index}.pdf`, place)).status);
  expect(uploads).toEqual([200, 200, 200, 200, 200, 429]);

  await seedState(alice, { lists: { clients: { upsert: [{ id: 1, name: "Northwind" }], remove: [] } } });
  const saves: number[] = [];
  for (let index = 0; index < 121; index++) saves.push((await call("/api/spaces/1", { method: "PATCH", person: alice, body: { name: `Northwind ${index}` } })).status);
  expect(saves.slice(0, 120).every((status) => status === 200)).toBe(true);
  expect(saves[120]).toBe(429);
});

test("an /api address no route answers is a JSON 404, whatever the method; existing routes keep theirs", async () => {
  const alice = await signUp("Alice Martin");
  await createAgency(alice, "Studio Adresses");
  for (const [path, method] of [
    ["/api/inconnue", "GET"],
    ["/api/deliverables/1/approval", "POST"],
    ["/api/comments/1/inconnue", "PUT"],
    ["/api/spaces/1/a/b", "PATCH"],
    ["/api/projets", "DELETE"],
  ] as const) {
    const answer = await call(path, { method, person: alice, body: method === "GET" || method === "DELETE" ? undefined : {} });
    expect(answer.status, `${method} ${path}`).toBe(404);
    expect(answer.json).toEqual({ error: "Route inconnue" });
  }
  // Without a session, the proxy answers first, as for any agency route.
  expect((await call("/api/inconnue")).status).toBe(401);
  // A known route keeps its own answers: read only state, missing method.
  expect((await call("/api/state", { person: alice })).status).toBe(200);
  expect((await call("/api/state", { method: "PATCH", person: alice, body: {} })).status).toBe(405);
});

test("files kept in Postgres before Azure storage are no longer served", async () => {
  const alice = await signUp("Alice Martin");
  await createAgency(alice, "Studio Ancien");
  expect((await call(`/api/files/${"a".repeat(64)}`, { person: alice })).status).toBe(404);
  expect((await call(`/api/files/${"a".repeat(64)}`)).status).toBe(404);
});

test("a stored file opens in the page only when that runs nothing: an SVG or an HTML page is downloaded instead", async () => {
  const alice = await signUp("Alice Martin");
  await createAgency(alice, "Studio Fichiers sûrs");
  const placement = { kind: "version", projectId: 7, livrableId: 70, version: 1 };
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script><rect width="10" height="10"/></svg>');
  const html = Buffer.from("<!doctype html><script>alert(1)</script><p>Reconnectez-vous</p>");
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
  /** How the storage tells the browser to treat the file, at the address /api/files sends it to. */
  const disposition = async (content: Buffer, name: string) => {
    const href = (await upload(alice, content, name, placement)).json.href!;
    const sent = await call(href, { person: alice });
    expect(sent.status).toBe(302);
    const stored = await fetch(sent.response.headers.get("location")!);
    await stored.arrayBuffer();
    return stored.headers.get("content-disposition") ?? "";
  };
  expect(await disposition(svg, "logo.svg")).toMatch(/^attachment/);
  expect(await disposition(html, "page.html")).toMatch(/^attachment/);
  expect(await disposition(png, "maquette.png")).toMatch(/^inline/);
  expect(await disposition(makePdf("Devis"), "devis.pdf")).toMatch(/^inline/);
});
