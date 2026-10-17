// Reads an agency's shared state from the tables and applies the changes sent by a page, in one
// transaction. Every query is limited to that agency (`org`): rows of other agencies are never read,
// written or deleted, even when ids collide.

import { and, eq, inArray, sql } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import type { ListCollection, SharedState, StateChanges } from "@/lib/sharedState";
import type { Db } from "./client";
import {
  auditEvents,
  clients,
  commentProposals,
  comments,
  deliverables,
  notifications,
  projects,
  proposalVersions,
  reviewAccessRequests,
  reviewLinks,
  settings,
  syncState,
  trashItems,
} from "./schema";

type Record_ = Record<string, unknown>;

const text = (value: unknown) => (typeof value === "string" ? value : value == null ? null : String(value));
const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null);

/** Table of each list and the columns taken from a record (besides id, position and data). */
const lists = {
  clients: { table: clients, columns: (e: Record_) => ({ name: text(e.name) ?? "", email: text(e.email) }) },
  projects: {
    table: projects,
    columns: (e: Record_) => ({ name: text(e.name) ?? "", clientId: num(e.clientId) }),
  },
  deliverables: {
    table: deliverables,
    columns: (e: Record_) => ({
      projectId: num(e.projectId),
      name: text(e.name) ?? "",
      version: num(e.version) ?? 1,
      reviewStatus: text(e.reviewStatus),
      locked: e.locked === true,
    }),
  },
  comments: {
    table: comments,
    columns: (e: Record_) => ({ deliverableId: num(e.deliverableId), decision: text(e.decision), kind: text(e.kind) }),
  },
  notifications: { table: notifications, columns: () => ({}) },
  auditEvents: {
    table: auditEvents,
    columns: (e: Record_) => ({ type: text(e.type) ?? "", actor: text(e.actor) ?? "", commentId: num(e.commentId), deliverableId: num(e.deliverableId) }),
  },
  trash: {
    table: trashItems,
    columns: (e: Record_) => ({ kind: text(e.kind) ?? "", deletedAt: num(e.deletedAt) ?? Date.now() }),
  },
} satisfies Record<ListCollection, { table: PgTable; columns: (entity: Record_) => Record_ }>;

/** The audit trail is append-only: existing events are never changed or removed. */
const appendOnly = new Set<ListCollection>(["auditEvents"]);

/** Proposal maps keyed by comment id, each stored in a column of comment_proposals. */
const proposalColumns = {
  proposalStates: "state",
  proposalDecisions: "decision",
  adaptationRequests: "adaptation",
} as const;

/**
 * The agency's whole state in one query: each collection is aggregated to JSON by Postgres, in the
 * order the pages expect. One statement reads one consistent snapshot, and costs one round trip
 * (the app and the database may sit in different places).
 */
export async function readState(db: Db, org: string): Promise<{ revision: number; state: SharedState | null }> {
  const listColumns = (Object.entries(lists) as [ListCollection, (typeof lists)[ListCollection]][]).map(([collection, { table }]) => {
    const list = table as typeof clients;
    return sql`(select coalesce(json_agg(${list.data} order by ${list.position}, ${list.id}), '[]'::json) from ${list} where ${list.organizationId} = ${org}) as ${sql.identifier(collection)}`;
  });
  const result = await db.execute(sql`select
    (select ${syncState.revision} from ${syncState} where ${syncState.organizationId} = ${org}) as "revision",
    ${sql.join(listColumns, sql`, `)},
    (select coalesce(json_object_agg(${reviewLinks.key}, ${reviewLinks.data}), '{}'::json) from ${reviewLinks} where ${reviewLinks.organizationId} = ${org}) as "reviewLinks",
    (select coalesce(json_agg(json_build_object('commentId', ${commentProposals.commentId}::text, 'state', ${commentProposals.state}, 'decision', ${commentProposals.decision}, 'adaptation', ${commentProposals.adaptation})), '[]'::json)
       from ${commentProposals} where ${commentProposals.organizationId} = ${org}) as "proposals",
    (select coalesce(json_agg(json_build_object('commentId', ${proposalVersions.commentId}::text, 'data', ${proposalVersions.data}) order by ${proposalVersions.commentId}, ${proposalVersions.position}), '[]'::json)
       from ${proposalVersions} where ${proposalVersions.organizationId} = ${org}) as "versions",
    (select coalesce(json_agg(json_build_object('linkKey', ${reviewAccessRequests.linkKey}, 'email', ${reviewAccessRequests.email}, 'message', ${reviewAccessRequests.message},
       'requestedAt', to_char(${reviewAccessRequests.requestedAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))), '[]'::json)
       from ${reviewAccessRequests} where ${reviewAccessRequests.organizationId} = ${org} and ${reviewAccessRequests.status} = 'pending') as "accessRequests",
    (select coalesce(json_agg(json_build_object('key', ${settings.key}, 'value', ${settings.value})), '[]'::json) from ${settings} where ${settings.organizationId} = ${org}) as "settings"`);
  const row = result.rows[0] as Record_ & {
    revision: number | string | null;
    reviewLinks: Record_;
    proposals: { commentId: string; state: unknown; decision: unknown; adaptation: unknown }[];
    versions: { commentId: string; data: unknown }[];
    settings: { key: string; value: unknown }[];
  };
  if (row.revision === null) return { revision: 0, state: null };

  const state: SharedState = {};
  for (const collection of Object.keys(lists) as ListCollection[]) state[collection] = row[collection] as never;
  state.reviewLinks = row.reviewLinks;
  for (const [collection, column] of Object.entries(proposalColumns) as [keyof typeof proposalColumns, (typeof proposalColumns)[keyof typeof proposalColumns]][])
    state[collection] = Object.fromEntries(row.proposals.filter((proposal) => proposal[column] != null).map((proposal) => [proposal.commentId, proposal[column]]));
  const byComment: Record<string, unknown[]> = {};
  for (const version of row.versions) (byComment[version.commentId] ??= []).push(version.data);
  state.proposalVersions = byComment;
  // Pending access requests to review links (read-only here: decided through /api/review-access).
  (state as Record_).accessRequests = row.accessRequests;
  for (const setting of row.settings) (state as Record_)[setting.key] = setting.value;
  return { revision: Number(row.revision), state };
}

/** Lists whose new records go first when a page sends no order (the client page only sees part of them). */
const prepended = new Set<ListCollection>(["notifications", "auditEvents", "trash", "deliverables"]);

/**
 * Who sends the changes and from where, kept on the audit events they add: a user id or
 * "client:<e-mail>", and the request's IP address and browser.
 */
export type Writer = { recordedBy: string; ipAddress?: string | null; userAgent?: string | null };

export async function applyChanges(db: Db, org: string, changes: StateChanges, writer: Writer) {
  return db.transaction(async (tx) => {
    // First: takes the agency's row lock, so its concurrent writes are applied one after the other.
    const [sync] = await tx
      .insert(syncState)
      .values({ organizationId: org, revision: 1 })
      .onConflictDoUpdate({ target: syncState.organizationId, set: { revision: sql`${syncState.revision} + 1`, updatedAt: sql`now()` } })
      .returning({ revision: syncState.revision });


    for (const [collection, change] of Object.entries(changes.lists ?? {}) as [ListCollection, NonNullable<StateChanges["lists"][ListCollection]>][]) {
      const spec = lists[collection];
      if (!spec || !change) continue;
      const table = spec.table as typeof clients;
      for (const entity of change.upsert ?? []) {
        if (typeof entity?.id !== "number") continue;
        const row = { ...spec.columns(entity), data: entity };
        // Without an order, a new record goes at the start or the end of its list.
        const position = change.order?.length
          ? 0
          : prepended.has(collection)
            ? sql`(select coalesce(min(position), 0) - 1 from ${table} where ${table.organizationId} = ${org})`
            : sql`(select coalesce(max(position), 0) + 1 from ${table} where ${table.organizationId} = ${org})`;
        const recordedBy =
          collection === "auditEvents"
            ? { recordedBy: writer.recordedBy, ipAddress: writer.ipAddress ?? null, userAgent: writer.userAgent ?? null }
            : {};
        const insert = tx.insert(table).values({ organizationId: org, id: entity.id, ...row, ...recordedBy, position } as typeof clients.$inferInsert);
        await (appendOnly.has(collection)
          ? insert.onConflictDoNothing()
          : insert.onConflictDoUpdate({ target: [table.organizationId, table.id], set: row as Partial<typeof clients.$inferInsert> }));
      }
      const remove = (change.remove ?? []).filter((id) => typeof id === "number");
      if (remove.length && !appendOnly.has(collection))
        await tx.delete(table).where(and(eq(table.organizationId, org), inArray(table.id, remove)));
      // Order as one array literal ("{3,1,2}"): integers only, so nothing else reaches the query.
      const order = (change.order ?? []).filter(Number.isSafeInteger);
      if (order.length)
        await tx.execute(sql`
          update ${table} set position = o.ord
          from unnest(${`{${order.join(",")}}`}::bigint[]) with ordinality as o(id, ord)
          where ${table.organizationId} = ${org} and ${table.id} = o.id and ${table.position} is distinct from o.ord`);
    }

    const links = changes.maps?.reviewLinks;
    if (links) {
      for (const [key, value] of Object.entries(links.upsert ?? {})) {
        const link = (value ?? {}) as Record_;
        const row = {
          token: text(link.token) ?? "",
          deliverableId: num(link.deliverableId),
          version: num(link.version),
          active: link.active === true,
          data: link,
        };
        await tx
          .insert(reviewLinks)
          .values({ organizationId: org, key, ...row })
          .onConflictDoUpdate({ target: [reviewLinks.organizationId, reviewLinks.key], set: row });
      }
      if (links.remove?.length)
        await tx.delete(reviewLinks).where(and(eq(reviewLinks.organizationId, org), inArray(reviewLinks.key, links.remove)));
    }

    for (const [collection, column] of Object.entries(proposalColumns) as [keyof typeof proposalColumns, (typeof proposalColumns)[keyof typeof proposalColumns]][]) {
      const change = changes.maps?.[collection];
      if (!change) continue;
      const entries: [number, unknown][] = [
        ...Object.entries(change.upsert ?? {}).map(([key, value]) => [Number(key), value] as [number, unknown]),
        ...(change.remove ?? []).map((key) => [Number(key), null] as [number, unknown]),
      ];
      for (const [commentId, value] of entries) {
        if (!Number.isFinite(commentId)) continue;
        await tx
          .insert(commentProposals)
          .values({ organizationId: org, commentId, [column]: value })
          .onConflictDoUpdate({ target: [commentProposals.organizationId, commentProposals.commentId], set: { [column]: value } });
      }
    }

    const versions = changes.maps?.proposalVersions;
    if (versions) {
      const touched = [...Object.keys(versions.upsert ?? {}), ...(versions.remove ?? [])].map(Number).filter(Number.isFinite);
      if (touched.length)
        await tx.delete(proposalVersions).where(and(eq(proposalVersions.organizationId, org), inArray(proposalVersions.commentId, touched)));
      for (const [key, list] of Object.entries(versions.upsert ?? {})) {
        const commentId = Number(key);
        if (!Number.isFinite(commentId) || !Array.isArray(list)) continue;
        for (const [position, value] of list.entries()) {
          const version = (value ?? {}) as Record_;
          const id = num(version.id);
          if (id === null) continue;
          const row = { commentId, version: num(version.version) ?? 1, status: text(version.status) ?? "draft", position, data: version };
          await tx
            .insert(proposalVersions)
            .values({ organizationId: org, id, ...row })
            .onConflictDoUpdate({ target: [proposalVersions.organizationId, proposalVersions.id], set: row });
        }
      }
    }

    for (const [key, value] of Object.entries(changes.settings?.upsert ?? {}))
      await tx
        .insert(settings)
        .values({ organizationId: org, key, value })
        .onConflictDoUpdate({ target: [settings.organizationId, settings.key], set: { value } });
    if (changes.settings?.remove?.length)
      await tx.delete(settings).where(and(eq(settings.organizationId, org), inArray(settings.key, changes.settings.remove)));

    return { revision: sync.revision };
  });
}

export async function currentRevision(db: Db, org: string) {
  const [sync] = await db.select({ revision: syncState.revision }).from(syncState).where(eq(syncState.organizationId, org));
  return sync?.revision ?? 0;
}

/** Tells the agency's open pages to refresh after a write made outside applyChanges. */
export async function bumpRevision(db: Db, org: string) {
  await db
    .insert(syncState)
    .values({ organizationId: org, revision: 1 })
    .onConflictDoUpdate({ target: syncState.organizationId, set: { revision: sql`${syncState.revision} + 1`, updatedAt: sql`now()` } });
}
