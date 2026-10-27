// The agency's bell: an activity opens what it is about (src/app/(agency)/routes.ts notificationHref).

import { expect, test, type Page } from "@playwright/test";
import { call, clientAction, createAgency, newPerson, seedReview, seedState, signInPage, signUp, sql, unique, verifiedClient } from "./helpers";

const bell = async (page: Page) => {
  await page.getByRole("button", { name: /^Notifications/ }).first().click();
  return page.getByRole("dialog", { name: "Notifications" });
};

test("bell activities open their request, the share dialog or the version; those without a target stay text", async ({ browser }) => {
  const alice = await signUp("Alice Martin");
  await createAgency(alice, "Studio Cloche");
  const token = unique("tok-cloche");
  const { linkKey } = await seedReview(alice, token);
  await seedState(alice, {
    lists: {
      comments: {
        upsert: [{ id: 10, deliverableId: 1, author: "Alice Martin", initials: "AM", from: "agency", message: "Témoignages", decision: "Hors périmètre", kind: "request", title: "Témoignages", location: "", time: "t" }],
        remove: [],
      },
      notifications: {
        upsert: [
          { id: 1, message: "Ancienne notification", time: "x" },
          { id: 2, message: "Livrable disparu", time: "x", deliverableId: 99 },
        ],
        remove: [],
      },
    },
    maps: {
      proposalStates: { upsert: { "10": "sent" }, remove: [] },
      proposalVersions: { upsert: { "10": [{ id: 100, version: 1, commentId: 10, description: "Témoignages", amount: 900, deadline: 3, status: "sent", createdAt: "x" }] }, remove: [] },
    },
  });
  const email = `${unique("claire")}@client.test`;
  await call("/api/review-access/invite", { person: alice, body: { linkKey, emails: [email] } });
  const client = await verifiedClient(token, email);
  expect((await clientAction(client, token, "proposals/10/decision", "POST", { decision: "accepted" })).status).toBe(200);
  // An access request received before they were removed (21 October 2026): still in the bell, still answered.
  const stranger = `${unique("transmis")}@client.test`;
  await sql("insert into review_access_requests (organization_id, link_key, email, status) values ($1, $2, $3, 'pending')", [alice.organizationId, linkKey, stranger]);
  await seedState(alice, {
    lists: { notifications: { upsert: [{ id: 3, message: `${stranger} demande l'accès à la revue de « maquette.pdf »`, time: "À l'instant", deliverableId: 1, open: "share" }], remove: [] } },
  });
  expect((await call("/api/review-access/remind", { person: alice, body: { linkKey } })).status).toBe(200);

  const { page, errors } = await newPerson(browser);
  await signInPage(page, alice.email);
  await page.goto("/espaces");

  // A quote decision: the version, on its request.
  let panel = await bell(page);
  await panel.getByRole("link", { name: /proposition liée au commentaire #10/ }).click();
  await page.waitForURL((url) => url.pathname === "/projets/1/livrables/1");
  await expect(page.getByRole("dialog", { name: /^Demande hors scope/ })).toBeVisible();
  await expect.poll(() => new URL(page.url()).search).toBe("");

  // An access request: « Partager la revue », on the request.
  await page.goto("/espaces");
  panel = await bell(page);
  await panel.getByRole("link", { name: new RegExp(`${stranger.replace(/[.]/g, "\\.")} demande l'accès`) }).click();
  await expect(page.getByRole("heading", { name: "Partager la revue" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Demandes d’accès" }).getByText(stranger)).toBeVisible();
  // Closing it drops ?partage=1 from the address.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("heading", { name: "Partager la revue" })).toHaveCount(0);
  await expect.poll(() => new URL(page.url()).search).toBe("");

  // A reminder the agency sent: in its journal, not in its bell (it tells it nothing new). Older notifications,
  // or ones whose version is gone, stay plain text.
  panel = await bell(page);
  await expect(panel.getByText("Ancienne notification")).toBeVisible();
  await expect(panel).not.toContainText("Relance envoyée");
  await expect(panel.getByRole("link", { name: "Ancienne notification" })).toHaveCount(0);
  await expect(panel.getByRole("link", { name: "Livrable disparu" })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("the bell tells what is new from what was already seen; seen once the bell is closed", async ({ browser }) => {
  const alice = await signUp("Alice Martin");
  await createAgency(alice, "Studio Nouveautés");
  await seedState(alice, {
    lists: {
      notifications: {
        upsert: [
          // An older reminder notice: left out of the bell.
          { id: 1, message: "Relance envoyée hier", time: "x" },
          { id: 2, message: "Proposition acceptée par le client", time: "x" },
          { id: 3, message: "Accès demandé à la revue", time: "x" },
        ],
        remove: [],
      },
    },
  });
  const { page, errors } = await newPerson(browser);
  await signInPage(page, alice.email);
  await page.goto("/espaces");
  await expect(page.getByRole("button", { name: "Notifications (2 non lues)" }).first()).toBeVisible();
  let panel = await bell(page);
  await expect(panel).toContainText("Nouveaux · 2");
  await expect(panel).not.toContainText("Relance envoyée");
  await expect(panel.getByText("Proposition acceptée par le client (nouveau)")).toHaveCount(1);
  await expect(panel).not.toContainText("Déjà lus");

  // Closed, they are seen: listed under « Déjà lus », the count gone.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Notifications", exact: true }).first()).toBeVisible();
  panel = await bell(page);
  await expect(panel).toContainText("Rien de nouveau.");
  await expect(panel.locator(".notification-list.is-read")).toContainText("Proposition acceptée par le client");
  expect(errors).toEqual([]);
});

test("read, a client's message stays in the bell under « Déjà lus »; the newest always first", async ({ browser }) => {
  const alice = await signUp("Alice Martin");
  await createAgency(alice, "Studio Lus");
  const token = unique("tok-lus");
  await seedReview(alice, token);
  const hour = 60 * 60 * 1000;
  const now = Date.now();
  await seedState(alice, {
    lists: {
      comments: {
        upsert: [
          { id: 20, deliverableId: 1, author: "Claire Dubois", initials: "CD", from: "client", message: "Le logo plus grand", decision: "À qualifier", kind: "remark", location: "", time: "t", createdAt: now - 3 * hour },
          { id: 21, deliverableId: 1, author: "Claire Dubois", initials: "CD", from: "client", message: "Une autre couleur", decision: "À qualifier", kind: "remark", location: "", time: "t", createdAt: now - hour },
        ],
        remove: [],
      },
      notifications: { upsert: [{ id: now - 2 * hour, message: "Proposition acceptée par le client", time: "x" }], remove: [] },
    },
  });
  const { page, errors } = await newPerson(browser);
  await signInPage(page, alice.email);
  await page.goto("/espaces");
  let panel = await bell(page);
  // New: the two messages and the activity, the newest first.
  const fresh = panel.locator(".notification-list:not(.is-read) > li");
  await expect(fresh).toHaveCount(3);
  await expect(fresh.nth(0)).toContainText("Une autre couleur");
  await expect(fresh.nth(1)).toContainText("Proposition acceptée par le client");
  await expect(fresh.nth(2)).toContainText("Le logo plus grand");

  // Marked read: nothing new, and nothing gone; each one under « Déjà lus », in the same order.
  await panel.getByRole("button", { name: "Tout marquer comme lu" }).click();
  await expect(panel).toContainText("Rien de nouveau.");
  await page.keyboard.press("Escape");
  panel = await bell(page);
  const read = panel.locator(".notification-list.is-read > li");
  await expect(read).toHaveCount(3);
  await expect(read.nth(0)).toContainText("Une autre couleur");
  await expect(read.nth(1)).toContainText("Proposition acceptée par le client");
  await expect(read.nth(2)).toContainText("Le logo plus grand");
  expect(errors).toEqual([]);
});
