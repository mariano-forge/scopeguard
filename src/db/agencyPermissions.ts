// What a member of an agency may not do: commercial decisions and what cannot be undone. Owners and
// administrators may do everything; members produce (comment, import, qualify, draft a quote, share
// a review) but an administrator sends the quote.
//
// The pages send their changes as record-level differences (src/lib/sharedState.ts): each reserved
// action is recognised by comparing them with what the database holds.

import { and, eq, inArray } from "drizzle-orm";
import type { StateChanges } from "@/lib/sharedState";
import type { Db } from "./client";
import { clients, commentProposals, projects, proposalVersions, reviewLinks, trashItems } from "./schema";

type Data = Record<string, unknown>;

export const canManageAgency = (role: string | null | undefined) => role === "owner" || role === "admin";

const ids = (keys: string[]) => keys.map(Number).filter(Number.isFinite);

/** The reserved actions found in the changes, in French, for the refusal message. */
export async function reservedActions(db: Db, org: string, changes: StateChanges): Promise<string[]> {
  const found = new Set<string>();

  // Sending a quote: the request's proposal becomes "sent", or a quote version becomes "sent".
  const states = changes.maps?.proposalStates?.upsert ?? {};
  const versions = changes.maps?.proposalVersions?.upsert ?? {};
  const adaptations = changes.maps?.adaptationRequests;
  const commentIds = ids([...Object.keys(states), ...Object.keys(versions), ...Object.keys(adaptations?.upsert ?? {}), ...(adaptations?.remove ?? [])]);
  if (commentIds.length) {
    const proposals = new Map(
      (await db.select().from(commentProposals).where(and(eq(commentProposals.organizationId, org), inArray(commentProposals.commentId, commentIds)))).map(
        (row) => [String(row.commentId), row],
      ),
    );
    if (Object.entries(states).some(([key, value]) => value === "sent" && proposals.get(key)?.state !== "sent")) found.add("envoyer un devis");

    const stored = new Map(
      (await db.select({ id: proposalVersions.id, status: proposalVersions.status }).from(proposalVersions).where(and(eq(proposalVersions.organizationId, org), inArray(proposalVersions.commentId, commentIds)))).map(
        (row) => [row.id, row.status],
      ),
    );
    const sentNow = Object.values(versions).some(
      (list) => Array.isArray(list) && list.some((quote) => (quote as Data)?.status === "sent" && stored.get((quote as Data).id as number) !== "sent"),
    );
    if (sentNow) found.add("envoyer un devis");

    // Answering the client's counter-proposal: deciding on it, or dropping it before it was decided
    // (not when the request itself goes, with its deliverable, to the trash).
    const removedComments = new Set((changes.lists?.comments?.remove ?? []).map(String));
    const pendingAdaptation = (key: string) => {
      if (removedComments.has(key)) return false;
      const adaptation = proposals.get(key)?.adaptation as Data | null | undefined;
      return Boolean(adaptation) && !adaptation?.decision;
    };
    const decided = Object.entries(adaptations?.upsert ?? {}).some(
      ([key, value]) => (value as Data)?.decision && (value as Data).decision !== (proposals.get(key)?.adaptation as Data | null)?.decision,
    );
    if (decided || (adaptations?.remove ?? []).some(pendingAdaptation)) found.add("répondre à une contre-proposition");
  }

  // Revoking a client link.
  const links = changes.maps?.reviewLinks?.upsert ?? {};
  const revoked = Object.entries(links).filter(([, link]) => (link as Data)?.active === false).map(([key]) => key);
  if (revoked.length) {
    const active = await db
      .select({ key: reviewLinks.key })
      .from(reviewLinks)
      .where(and(eq(reviewLinks.organizationId, org), inArray(reviewLinks.key, revoked), eq(reviewLinks.active, true)));
    if (active.length) found.add("révoquer un lien client");
  }

  // Deleting a space or a project (they go to the trash, but take every deliverable with them).
  const removedClients = changes.lists?.clients?.remove ?? [];
  if (removedClients.length && (await db.select({ id: clients.id }).from(clients).where(and(eq(clients.organizationId, org), inArray(clients.id, removedClients)))).length)
    found.add("supprimer un espace");
  const removedProjects = changes.lists?.projects?.remove ?? [];
  if (removedProjects.length && (await db.select({ id: projects.id }).from(projects).where(and(eq(projects.organizationId, org), inArray(projects.id, removedProjects)))).length)
    found.add("supprimer un projet");

  // Deleting for good from the trash. Restoring also takes an item out of the trash, but puts its
  // records back in the same change.
  const removedTrash = changes.lists?.trash?.remove ?? [];
  if (removedTrash.length) {
    const items = await db.select({ data: trashItems.data }).from(trashItems).where(and(eq(trashItems.organizationId, org), inArray(trashItems.id, removedTrash)));
    const restored = new Set(
      (["clients", "projects", "deliverables"] as const).flatMap((list) => (changes.lists?.[list]?.upsert ?? []).map((record) => `${list}:${record.id}`)),
    );
    const purged = items.some(({ data }) => {
      // `data` is the trash item; what it holds is in its own `data` (TrashSnapshot).
      const snapshot = ((data as Data).data ?? {}) as Record<string, { id: number }[] | undefined>;
      const contents = (["clients", "projects", "deliverables"] as const).flatMap((list) => (snapshot[list] ?? []).map((record) => `${list}:${record.id}`));
      return !contents.some((key) => restored.has(key));
    });
    if (purged) found.add("supprimer définitivement de la corbeille");
  }

  return [...found];
}
