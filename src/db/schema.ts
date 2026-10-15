// Kora database schema.
//
// Each table keeps the columns the app relates and filters on (ids, links, statuses) next to `data`,
// the full record as the interface knows it. The interface shape can still move during the prototype
// without a migration each time; the columns are what later API routes and reports will query.

import { bigint, boolean, customType, index, integer, jsonb, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

// Ids come from Date.now() in the interface: past the 32-bit range.
const id = (name: string) => bigint(name, { mode: "number" });

const bytea = customType<{ data: Buffer }>({ dataType: () => "bytea" });

/** Single row: bumped on every write so open pages know when to refresh. */
export const syncState = pgTable("sync_state", {
  id: integer("id").primaryKey().default(1),
  revision: bigint("revision", { mode: "number" }).notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Client spaces ("espaces"). */
export const clients = pgTable("clients", {
  id: id("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email"),
  position: integer("position").notNull().default(0),
  data: jsonb("data").notNull(),
});

export const projects = pgTable(
  "projects",
  {
    id: id("id").primaryKey(),
    clientId: id("client_id"),
    name: text("name").notNull(),
    position: integer("position").notNull().default(0),
    data: jsonb("data").notNull(),
  },
  (table) => [index("projects_client_idx").on(table.clientId)],
);

/** One row per version of a deliverable; versions of a deliverable share project and name. */
export const deliverables = pgTable(
  "deliverables",
  {
    id: id("id").primaryKey(),
    projectId: id("project_id"),
    name: text("name").notNull(),
    version: integer("version").notNull(),
    reviewStatus: text("review_status"),
    locked: boolean("locked").notNull().default(false),
    position: integer("position").notNull().default(0),
    data: jsonb("data").notNull(),
  },
  (table) => [index("deliverables_project_idx").on(table.projectId, table.name)],
);

/** Remarks and requests on a deliverable version, with their qualification. */
export const comments = pgTable(
  "comments",
  {
    id: id("id").primaryKey(),
    deliverableId: id("deliverable_id"),
    decision: text("decision"),
    kind: text("kind"),
    position: integer("position").notNull().default(0),
    data: jsonb("data").notNull(),
  },
  (table) => [index("comments_deliverable_idx").on(table.deliverableId)],
);

/** Proposal state, client decision and adaptation request of an out-of-scope request. */
export const commentProposals = pgTable("comment_proposals", {
  commentId: id("comment_id").primaryKey(),
  state: text("state"),
  decision: text("decision"),
  adaptation: jsonb("adaptation"),
});

/** Successive quotes sent for a request. */
export const proposalVersions = pgTable(
  "proposal_versions",
  {
    id: id("id").primaryKey(),
    commentId: id("comment_id").notNull(),
    version: integer("version").notNull(),
    status: text("status").notNull(),
    position: integer("position").notNull().default(0),
    data: jsonb("data").notNull(),
  },
  (table) => [index("proposal_versions_comment_idx").on(table.commentId)],
);

/** Client review links, one per deliverable version ("deliverableId:version"). */
export const reviewLinks = pgTable(
  "review_links",
  {
    key: text("key").primaryKey(),
    token: text("token").notNull(),
    deliverableId: id("deliverable_id"),
    version: integer("version"),
    active: boolean("active").notNull(),
    data: jsonb("data").notNull(),
  },
  (table) => [index("review_links_token_idx").on(table.token)],
);

export const notifications = pgTable("notifications", {
  id: id("id").primaryKey(),
  position: integer("position").notNull().default(0),
  data: jsonb("data").notNull(),
});

/** Timestamped trail of decisions. Append-only: a trigger refuses updates and deletes. */
export const auditEvents = pgTable(
  "audit_events",
  {
    id: id("id").primaryKey(),
    type: text("type").notNull(),
    actor: text("actor").notNull(),
    commentId: id("comment_id"),
    position: integer("position").notNull().default(0),
    data: jsonb("data").notNull(),
    /** Who the server saw sending it: a user id, or "review-link:<key>" for a client. */
    recordedBy: text("recorded_by"),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("audit_events_comment_idx").on(table.commentId)],
);

/** Deleted spaces, projects and deliverables, restorable for 30 days. */
export const trashItems = pgTable("trash_items", {
  id: id("id").primaryKey(),
  kind: text("kind").notNull(),
  deletedAt: bigint("deleted_at", { mode: "number" }).notNull(),
  position: integer("position").notNull().default(0),
  data: jsonb("data").notNull(),
});

/** Loose values of the shared state (legacy review link, last reminder). */
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value"),
});

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
 * an invited address with a code sent to it, then the device is remembered for 30 days.
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
    linkKey: text("link_key").notNull(),
    email: text("email").notNull(),
    /** "pending", "accepted" or "refused". */
    status: text("status").notNull(),
    message: text("message"),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decidedBy: text("decided_by"),
  },
  (table) => [primaryKey({ columns: [table.linkKey, table.email] })],
);

export * from "./auth-schema";
