// Kora database schema.
//
// Each table keeps the columns the app relates and filters on (ids, links, statuses) next to `data`,
// the full record as the interface knows it. The interface shape can still move during the prototype
// without a migration each time; the columns are what later API routes and reports will query.
//
// Every agency record belongs to an organization (src/db/auth-schema.ts) and its primary key starts
// with organization_id: the interface makes ids with Date.now(), and two agencies sharing an id must
// never reach each other's rows. All queries filter on it (src/db/state.ts).

import { bigint, boolean, customType, index, integer, jsonb, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";
import { organizations } from "./auth-schema";

// Ids come from Date.now() in the interface: past the 32-bit range.
const id = (name: string) => bigint(name, { mode: "number" });
const organizationId = () =>
  text("organization_id")
    .notNull()
    .references(() => organizations.id);

const bytea = customType<{ data: Buffer }>({ dataType: () => "bytea" });

/** One row per agency: bumped on every write so its open pages know when to refresh. */
export const syncState = pgTable("sync_state", {
  organizationId: organizationId().primaryKey(),
  revision: bigint("revision", { mode: "number" }).notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Client spaces ("espaces"). */
export const clients = pgTable(
  "clients",
  {
    organizationId: organizationId(),
    id: id("id").notNull(),
    name: text("name").notNull(),
    email: text("email"),
    position: integer("position").notNull().default(0),
    data: jsonb("data").notNull(),
  },
  (table) => [primaryKey({ columns: [table.organizationId, table.id] })],
);

export const projects = pgTable(
  "projects",
  {
    organizationId: organizationId(),
    id: id("id").notNull(),
    clientId: id("client_id"),
    name: text("name").notNull(),
    position: integer("position").notNull().default(0),
    data: jsonb("data").notNull(),
  },
  (table) => [primaryKey({ columns: [table.organizationId, table.id] }), index("projects_client_idx").on(table.organizationId, table.clientId)],
);

/** One row per version of a deliverable; versions of a deliverable share project and name. */
export const deliverables = pgTable(
  "deliverables",
  {
    organizationId: organizationId(),
    id: id("id").notNull(),
    projectId: id("project_id"),
    name: text("name").notNull(),
    version: integer("version").notNull(),
    reviewStatus: text("review_status"),
    locked: boolean("locked").notNull().default(false),
    position: integer("position").notNull().default(0),
    data: jsonb("data").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.id] }),
    index("deliverables_project_idx").on(table.organizationId, table.projectId, table.name),
  ],
);

/** Remarks and requests on a deliverable version, with their qualification. */
export const comments = pgTable(
  "comments",
  {
    organizationId: organizationId(),
    id: id("id").notNull(),
    deliverableId: id("deliverable_id"),
    decision: text("decision"),
    kind: text("kind"),
    position: integer("position").notNull().default(0),
    data: jsonb("data").notNull(),
  },
  (table) => [primaryKey({ columns: [table.organizationId, table.id] }), index("comments_deliverable_idx").on(table.organizationId, table.deliverableId)],
);

/** Proposal state, client decision and adaptation request of an out-of-scope request. */
export const commentProposals = pgTable(
  "comment_proposals",
  {
    organizationId: organizationId(),
    commentId: id("comment_id").notNull(),
    state: text("state"),
    decision: text("decision"),
    adaptation: jsonb("adaptation"),
  },
  (table) => [primaryKey({ columns: [table.organizationId, table.commentId] })],
);

/** Successive quotes sent for a request. */
export const proposalVersions = pgTable(
  "proposal_versions",
  {
    organizationId: organizationId(),
    id: id("id").notNull(),
    commentId: id("comment_id").notNull(),
    version: integer("version").notNull(),
    status: text("status").notNull(),
    position: integer("position").notNull().default(0),
    data: jsonb("data").notNull(),
  },
  (table) => [primaryKey({ columns: [table.organizationId, table.id] }), index("proposal_versions_comment_idx").on(table.organizationId, table.commentId)],
);

/** Client review links, one per deliverable version ("deliverableId:version"). The token is global. */
export const reviewLinks = pgTable(
  "review_links",
  {
    organizationId: organizationId(),
    key: text("key").notNull(),
    token: text("token").notNull().unique(),
    deliverableId: id("deliverable_id"),
    version: integer("version"),
    active: boolean("active").notNull(),
    data: jsonb("data").notNull(),
  },
  (table) => [primaryKey({ columns: [table.organizationId, table.key] })],
);

export const notifications = pgTable(
  "notifications",
  {
    organizationId: organizationId(),
    id: id("id").notNull(),
    position: integer("position").notNull().default(0),
    data: jsonb("data").notNull(),
  },
  (table) => [primaryKey({ columns: [table.organizationId, table.id] })],
);

/** Timestamped trail of decisions. Append-only: a trigger refuses updates and deletes. */
export const auditEvents = pgTable(
  "audit_events",
  {
    organizationId: organizationId(),
    id: id("id").notNull(),
    type: text("type").notNull(),
    actor: text("actor").notNull(),
    commentId: id("comment_id"),
    position: integer("position").notNull().default(0),
    data: jsonb("data").notNull(),
    /** Version the event is about (directly, or through its request), for the proof of that version. */
    deliverableId: id("deliverable_id"),
    /** Who the server saw sending it: a user id, or "client:<e-mail>" for a verified client. */
    recordedBy: text("recorded_by"),
    /** Where the request came from, as the server received it. */
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.id] }),
    index("audit_events_comment_idx").on(table.organizationId, table.commentId),
    index("audit_events_deliverable_idx").on(table.organizationId, table.deliverableId),
  ],
);

/** Deleted spaces, projects and deliverables, restorable for 30 days. */
export const trashItems = pgTable(
  "trash_items",
  {
    organizationId: organizationId(),
    id: id("id").notNull(),
    kind: text("kind").notNull(),
    deletedAt: bigint("deleted_at", { mode: "number" }).notNull(),
    position: integer("position").notNull().default(0),
    data: jsonb("data").notNull(),
  },
  (table) => [primaryKey({ columns: [table.organizationId, table.id] })],
);

/** Loose values of the shared state (legacy review link, last reminder). */
export const settings = pgTable(
  "settings",
  {
    organizationId: organizationId(),
    key: text("key").notNull(),
    value: jsonb("value"),
  },
  (table) => [primaryKey({ columns: [table.organizationId, table.key] })],
);

/**
 * Imported files (PDF, images, covers). The id is the SHA-256 of the content, so the same file
 * is stored once. Kept in Postgres for the pilot; moves to object storage (Supabase Storage,
 * Azure Blob) by changing src/db/files.ts only.
 */
export const files = pgTable("files", {
  id: text("id").primaryKey(),
  mimeType: text("mime_type").notNull(),
  size: integer("size").notNull(),
  content: bytea("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Client access to review links (src/db/reviewAuth.ts). Clients have no password: they prove they own
 * an invited address with a code sent to it, then the device is remembered for 30 days. Codes and
 * sessions belong to the address, across agencies; access is still decided per link.
 */
export const reviewCodes = pgTable(
  "review_codes",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    /** HMAC of the 6 digits: a database leak does not give working codes. */
    codeHash: text("code_hash").notNull(),
    attempts: integer("attempts").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("review_codes_email_idx").on(table.email, table.createdAt)],
);

/** A verified client address on one device. Gives access to the links that address is invited to. */
export const reviewSessions = pgTable(
  "review_sessions",
  {
    id: text("id").primaryKey(),
    /** SHA-256 of the cookie value. */
    tokenHash: text("token_hash").notNull().unique(),
    email: text("email").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("review_sessions_email_idx").on(table.email)],
);

/** Someone with the link but not invited asks the agency for access. */
export const reviewAccessRequests = pgTable(
  "review_access_requests",
  {
    organizationId: organizationId(),
    linkKey: text("link_key").notNull(),
    email: text("email").notNull(),
    /** "pending", "accepted" or "refused". */
    status: text("status").notNull(),
    message: text("message"),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decidedBy: text("decided_by"),
  },
  (table) => [primaryKey({ columns: [table.organizationId, table.linkKey, table.email] })],
);

export * from "./auth-schema";
