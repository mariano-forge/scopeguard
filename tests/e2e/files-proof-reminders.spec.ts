// Imported files (Azure Blob, through Azurite here), the proof of a version, and client reminders.

import { createHash } from "node:crypto";
import { expect, test } from "@playwright/test";
import {
  addColleague,
  call,
  createAgency,
  lastMailTo,
  makePdf,
  mailsTo,
  newPerson,
  patchReview,
  patchState,
  readState,
  seedReview,
  signInPage,
  signUp,
  sql,
  unique,
  upload,
  verifiedClient,
} from "./helpers";

test("a PDF imported from the agency page is stored by version, shown, and served only to who may see it", async ({ browser }) => {
  const alice = await signUp("Alice Martin");
  await createAgency(alice, "Studio Fichiers");
  await patchState(alice, {
    lists: {
      clients: { upsert: [{ id: 1, name: "Northwind" }], remove: [] },
      projects: { upsert: [{ id: 7, name: "Refonte", clientId: 1, client: "Northwind", status: "En cours" }], remove: [] },
    },
  });

  const { page, errors } = await newPerson(browser);
  // Imports go straight to the storage (src/lib/upload.ts), not through POST /api/files.
  const imports: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "PUT" || request.url().includes("/api/files")) imports.push(`${request.method()} ${new URL(request.url()).pathname.split("/projets/")[0]}`);
  });
  await signInPage(page, alice.email);
  await page.goto("/projets/7");
  await page.getByRole("button", { name: /Livrable|Nouveau livrable/ }).first().click();
  await page.getByLabel("Nom du livrable").fill("Maquette accueil");
  await page.locator('input[type="file"]').first().setInputFiles({ name: "maquette.pdf", mimeType: "application/pdf", buffer: makePdf("Version 1", 2) });
  await page.getByRole("button", { name: "Créer le livrable" }).click();
  await page.waitForURL(/livrables\/\d+/);
  await expect(page.locator(".react-pdf__Page canvas").first()).toBeVisible();

  await page.getByRole("button", { name: "Menu principal" }).first().click();
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.getByRole("menuitem", { name: /Nouvelle version/ }).click()]);
  await chooser.setFiles({ name: "maquette-v2.pdf", mimeType: "application/pdf", buffer: makePdf("Version 2") });
  await expect.poll(async () => (await sql("select 1 from stored_files where organization_id = $1", [alice.organizationId])).length).toBe(2);

  expect(imports.filter((entry) => !entry.startsWith("GET"))).toEqual([
    "POST /api/files/upload",
    expect.stringMatching(/^PUT \//),
    "POST /api/files/complete",
    "POST /api/files/upload",
    expect.stringMatching(/^PUT \//),
    "POST /api/files/complete",
  ]);

  const files = await sql<{ id: string; path: string; sha256: string }>("select id, path, sha256 from stored_files where organization_id = $1 order by created_at", [alice.organizationId]);
  expect(files[0].path).toMatch(/^projets\/7\/livrables\/\d+\/v1\/[0-9a-f]{64}\.pdf$/);
  expect(files[1].path).toMatch(/^projets\/7\/livrables\/\d+\/v2\/[0-9a-f]{64}\.pdf$/);
  expect(files[0].sha256).toBe(createHash("sha256").update(makePdf("Version 1", 2)).digest("hex"));

  // A direct visit of the version's address (data loading) shows it without error.
  const { page: direct, errors: directErrors } = await newPerson(browser);
  await signInPage(direct, alice.email);
  await direct.goto(page.url());
  await expect(direct.locator(".react-pdf__Page canvas").first()).toBeVisible();

  const v1 = `/api/files/${files[0].id}`;
  expect((await call(v1)).status).toBe(404);
  const asMember = await call(v1, { person: alice });
  expect(asMember.status).toBe(302);
  const content = Buffer.from(await (await fetch(asMember.response.headers.get("location")!)).arrayBuffer());
  expect(content.equals(makePdf("Version 1", 2))).toBe(true);
  const bob = await signUp("Bob Durand");
  await createAgency(bob, "Studio Autre");
  expect((await call(v1, { person: bob })).status).toBe(404);
  expect([...errors, ...directErrors]).toEqual([]);
});

test("uploads: size limit, place checked, session required", async () => {
  const alice = await signUp("Alice Martin");
  await createAgency(alice, "Studio Limite");
  const place = { kind: "version", projectId: 1, livrableId: 1, version: 1 };
  const big = await upload(alice, Buffer.alloc(1_500_000, 1), "trop-gros.pdf", place);
  expect(big.status).toBe(413);
  expect(big.json.error).toContain("1 Mo");
  expect((await upload(alice, makePdf("x"), "x.pdf", { ...place, projectId: "../../etc" })).status).toBe(400);
  expect((await upload({ cookie: "", ip: "198.51.200.1" }, makePdf("x"), "x.pdf", place)).status).toBe(401);
});

test("a verified client gets only the files of the version shared with them", async () => {
  const alice = await signUp("Alice Martin");
  await createAgency(alice, "Studio Partage");
  const shared = await upload(alice, makePdf("partagé"), "partage.pdf", { kind: "version", projectId: 1, livrableId: 2, version: 1 });
  const hidden = await upload(alice, makePdf("caché"), "cache.pdf", { kind: "version", projectId: 1, livrableId: 1, version: 1 });
  const token = unique("tok-files");
  const { linkKey } = await seedReview(alice, token, { deliverableId: 2 });
  await patchState(alice, {
    lists: {
      deliverables: {
        upsert: [
          { id: 1, projectId: 1, name: "cache.pdf", type: "PDF", version: 1, fileData: hidden.json.href },
          { id: 2, projectId: 1, name: "partage.pdf", type: "PDF", version: 1, fileData: shared.json.href },
        ],
        remove: [],
      },
    },
  });
  const email = `${unique("claire")}@client.test`;
  await call("/api/review-access/invite", { person: alice, body: { linkKey, emails: [email] } });
  const client = await verifiedClient(token, email);
  expect((await call(shared.json.href!, { person: client })).status).toBe(302);
  expect((await call(hidden.json.href!, { person: client })).status).toBe(404);
});

test("the proof shows who decided, when and from where, from the server's records", async () => {
  const alice = await signUp("Alice Martin");
  await createAgency(alice, "Studio Preuve");
  const file = await upload(alice, makePdf("maquette"), "maquette.pdf", { kind: "version", projectId: 1, livrableId: 1, version: 2 });
  const token = unique("tok-proof");
  const { linkKey } = await seedReview(alice, token, { deliverableId: 1, version: 2 });
  await patchState(alice, {
    lists: {
      deliverables: { upsert: [{ id: 1, projectId: 1, name: "maquette.pdf", type: "PDF", version: 2, status: "En attente client", fileData: file.json.href }], remove: [] },
      comments: { upsert: [{ id: 10, deliverableId: 1, author: "Alice Martin", initials: "AM", from: "agency", message: "Section témoignages", decision: "Hors périmètre", kind: "request", title: "Témoignages", location: "Page 1", time: "t" }], remove: [] },
    },
    maps: {
      proposalStates: { upsert: { "10": "sent" }, remove: [] },
      proposalVersions: { upsert: { "10": [{ id: 100, version: 1, commentId: 10, description: "Témoignages", amount: 900, deadline: 3, status: "sent", createdAt: "x" }] }, remove: [] },
    },
  });
  const email = `${unique("claire")}@client.test`;
  await call("/api/review-access/invite", { person: alice, body: { linkKey, emails: [email] } });
  const verified = await verifiedClient(token, email, "Claire Dubois");
  // Behind one trusted proxy: the visitor's own header (6.6.6.6) is ignored, the proxy's address kept.
  const client = { cookie: verified.cookie, ip: "6.6.6.6, 203.0.113.7" };
  await patchReview(client, token, {
    maps: { proposalDecisions: { upsert: { "10": "accepted" }, remove: [] }, proposalVersions: { upsert: { "10": [{ id: 100, status: "accepted" }] }, remove: [] } },
    lists: { auditEvents: { upsert: [{ id: Date.now(), type: "proposal.decision", actor: "x", description: "Proposition acceptée par le client", timestamp: "", commentId: 10 }], remove: [] } },
  });
  await patchReview(client, token, {
    lists: {
      deliverables: { upsert: [{ id: 1, version: 2, reviewStatus: "approved", approvedAt: "x" }], remove: [] },
      auditEvents: { upsert: [{ id: Date.now() + 1, type: "deliverable.approved", actor: "x", description: "Version 2 approuvée par le client", timestamp: "" }], remove: [] },
    },
  });

  const proof = (await call("/api/proof/1", { person: alice })).json as Record<string, unknown>;
  expect(proof.deliverable).toMatchObject({ file: { sha256: createHash("sha256").update(makePdf("maquette")).digest("hex"), originalName: "maquette.pdf" } });
  expect(proof.approval).toMatchObject({ identity: { kind: "client", label: `Client vérifié : ${email}` }, ipAddress: "203.0.113.7" });
  const request = (proof.requests as { id: number; decision: string; decisionEvent: { ipAddress: string } }[]).find((entry) => entry.id === 10)!;
  expect(request.decision).toBe("accepted");
  expect(request.decisionEvent.ipAddress).toBe("203.0.113.7");
  expect(proof.fingerprint).toMatch(/^[0-9a-f]{64}$/);
  const bob = await signUp("Bob Durand");
  await createAgency(bob, "Studio Curieux");
  expect((await call("/api/proof/1", { person: bob })).status).toBe(404);
});

test("reminders: to every invited client with their link, once a day, never on an approved version", async ({ browser }) => {
  const alice = await signUp("Alice Martin");
  await createAgency(alice, "Studio Relance");
  const token = unique("tok-remind");
  const { linkKey } = await seedReview(alice, token);
  expect((await call("/api/review-access/remind", { person: alice, body: { linkKey } })).status).toBe(400);

  const claire = `${unique("claire")}@client.test`;
  const paul = `${unique("paul")}@client.test`;
  await call("/api/review-access/invite", { person: alice, body: { linkKey, emails: [claire, paul] } });
  expect((await call("/api/review-access/remind", { person: alice, body: { linkKey } })).status).toBe(200);
  for (const email of [claire, paul]) {
    const reminder = lastMailTo(email)!;
    expect(reminder.subject).toContain("Rappel");
    expect(reminder.replyTo).toBe(alice.email);
    expect(reminder.text).toContain("invitation=");
  }
  expect((await call("/api/review-access/remind", { person: alice, body: { linkKey } })).status).toBe(429);
  expect(mailsTo(claire).filter((mail) => mail.subject.includes("Rappel")).length).toBe(1);

  const { page } = await newPerson(browser);
  await signInPage(page, alice.email);
  await page.goto("/projets/1/livrables/1");
  await page.getByRole("button", { name: "Partager la revue" }).first().click();
  await expect(page.getByRole("button", { name: "Relance déjà envoyée" })).toBeDisabled();
  await expect(page.getByText(/Dernière relance/)).toBeVisible();

  const member = await addColleague(alice, "Mia Laurent", "member");
  const other = await seedReview(alice, unique("tok-remind2"), { deliverableId: 2 });
  await call("/api/review-access/invite", { person: alice, body: { linkKey: other.linkKey, emails: [claire] } });
  expect((await call("/api/review-access/remind", { person: member, body: { linkKey: other.linkKey } })).status).toBe(200);

  // A third review, never reminded, whose version is approved: refused for that reason.
  const done = await seedReview(alice, unique("tok-remind3"), { deliverableId: 3 });
  await call("/api/review-access/invite", { person: alice, body: { linkKey: done.linkKey, emails: [claire] } });
  await patchState(alice, { lists: { deliverables: { upsert: [{ id: 3, projectId: 1, name: "maquette-3.png", type: "Image", version: 1, status: "Approuvée", reviewStatus: "approved", locked: true }], remove: [] } } });
  const approved = await call("/api/review-access/remind", { person: alice, body: { linkKey: done.linkKey } });
  expect(approved.status).toBe(400);
  expect(approved.json.error).toContain("n’attend plus de validation");
  expect((await readState(alice)).auditEvents).toEqual(expect.arrayContaining([expect.objectContaining({ type: "review.reminded" })]));
});
