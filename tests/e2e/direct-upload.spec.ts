// Direct imports (src/lib/storage.ts prepareUpload / completeUpload): the browser sends the file
// straight to the storage with a create-only address, and the server checks what arrived.

import { createHash } from "node:crypto";
import { expect, test } from "@playwright/test";
import { baseURL } from "../../playwright.config";
import { call, createAgency, makePdf, signUp, sql, type Person } from "./helpers";

const sha = (content: Buffer) => createHash("sha256").update(content).digest("hex");
const place = { kind: "version", projectId: 3, livrableId: 4, version: 1 };

const prepare = (person: Person, content: Buffer, extra: Record<string, unknown> = {}) =>
  call("/api/files/upload", { person, body: { name: "maquette.pdf", type: "application/pdf", size: content.length, sha256: sha(content), ...place, ...extra } });
const send = (uploadUrl: string, content: Buffer) =>
  fetch(uploadUrl, { method: "PUT", headers: { "x-ms-blob-type": "BlockBlob", "content-type": "application/pdf" }, body: new Uint8Array(content) });
const complete = (person: Person, token: unknown) => call("/api/files/complete", { person, body: { token } });

test("a file sent straight to the storage is checked, recorded once, and served", async () => {
  const alice = await signUp("Alice Martin");
  await createAgency(alice, "Studio Direct");
  const content = makePdf("Envoi direct");

  const prepared = await prepare(alice, content);
  expect(prepared.status).toBe(200);
  const uploadUrl = prepared.json.uploadUrl as string;
  expect(uploadUrl).toContain(`/projets/3/livrables/4/v1/${sha(content)}.pdf?`);
  expect((await send(uploadUrl, content)).status).toBe(201);
  const done = await complete(alice, prepared.json.token);
  expect(done.status).toBe(200);
  expect(done.json.sha256).toBe(sha(content));

  const served = await call(done.json.href as string, { person: alice });
  expect(served.status).toBe(302);
  expect(Buffer.from(await (await fetch(served.response.headers.get("location")!)).arrayBuffer()).equals(content)).toBe(true);

  // The same file at the same place: nothing to send, the same record.
  const again = await prepare(alice, content);
  expect(again.json.uploadUrl).toBeNull();
  expect((await complete(alice, again.json.token)).json.id).toBe(done.json.id);
  expect(await sql("select 1 from stored_files where organization_id = $1", [alice.organizationId])).toHaveLength(1);

  // The write address can create, nothing else: no reading, no replacing.
  expect((await fetch(uploadUrl)).ok).toBe(false);
  expect((await send(uploadUrl, makePdf("Remplacement"))).ok).toBe(false);
});

test("content that differs from the announced one is refused and removed", async () => {
  const alice = await signUp("Alice Martin");
  await createAgency(alice, "Studio Falsifié");
  const announced = makePdf("Annoncé");
  const prepared = await prepare(alice, announced);
  expect((await send(prepared.json.uploadUrl as string, makePdf("Autre contenu"))).status).toBe(201);
  const done = await complete(alice, prepared.json.token);
  expect(done.status).toBe(400);
  expect(await sql("select 1 from stored_files where organization_id = $1", [alice.organizationId])).toHaveLength(0);
  // Removed from the storage: the announced file can now be sent at its place.
  const retry = await prepare(alice, announced);
  expect(retry.json.uploadUrl).toEqual(expect.any(String));
  expect((await send(retry.json.uploadUrl as string, announced)).status).toBe(201);
  expect((await complete(alice, retry.json.token)).status).toBe(200);

  // Announced but never sent.
  const missing = await prepare(alice, makePdf("Jamais envoyé"));
  expect((await complete(alice, missing.json.token)).status).toBe(400);
});

test("tokens are signed and bound to their agency; sizes, places, sessions and origins are checked", async () => {
  const alice = await signUp("Alice Martin");
  await createAgency(alice, "Studio Jetons");
  const bob = await signUp("Bob Durand");
  await createAgency(bob, "Studio Voisin");
  const content = makePdf("Jeton");
  const prepared = await prepare(alice, content);
  await send(prepared.json.uploadUrl as string, content);
  const token = prepared.json.token as string;

  expect((await complete(bob, token)).status).toBe(400);
  const [body, mac] = token.split(".");
  const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, "base64url").toString()), org: bob.organizationId })).toString("base64url");
  expect((await complete(bob, `${forged}.${mac}`)).status).toBe(400);
  expect((await complete(alice, "pas-un-jeton")).status).toBe(400);
  expect((await complete(alice, 42)).status).toBe(400);
  expect(await sql("select 1 from stored_files where organization_id = $1", [bob.organizationId])).toHaveLength(0);

  const big = await prepare(alice, content, { size: 1_500_000 });
  expect(big.status).toBe(413);
  expect(big.json.error).toContain("1 Mo");
  expect((await prepare(alice, content, { projectId: "../../etc" })).status).toBe(400);
  expect((await prepare(alice, content, { sha256: "../x" })).status).toBe(400);
  expect((await prepare(alice, content, { kind: "autre" })).status).toBe(400);
  expect((await prepare({ cookie: "", ip: "198.51.200.2" }, content)).status).toBe(401);
  expect((await complete({ cookie: "", ip: "198.51.200.2" }, token)).status).toBe(401);

  for (const path of ["/api/files/upload", "/api/files/complete"]) {
    const response = await fetch(baseURL + path, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://evil.example", cookie: alice.cookie, "x-forwarded-for": alice.ip },
      body: JSON.stringify({ token, size: content.length, sha256: sha(content), ...place }),
    });
    expect(response.status).toBe(403);
  }
});
