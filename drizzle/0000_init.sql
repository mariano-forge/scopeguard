CREATE TABLE "audit_events" (
	"id" bigint PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"actor" text NOT NULL,
	"comment_id" bigint,
	"position" integer DEFAULT 0 NOT NULL,
	"data" jsonb NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" bigint PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"position" integer DEFAULT 0 NOT NULL,
	"data" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comment_proposals" (
	"comment_id" bigint PRIMARY KEY NOT NULL,
	"state" text,
	"decision" text,
	"adaptation" jsonb
);
--> statement-breakpoint
CREATE TABLE "comments" (
	"id" bigint PRIMARY KEY NOT NULL,
	"deliverable_id" bigint,
	"decision" text,
	"kind" text,
	"position" integer DEFAULT 0 NOT NULL,
	"data" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deliverables" (
	"id" bigint PRIMARY KEY NOT NULL,
	"project_id" bigint,
	"name" text NOT NULL,
	"version" integer NOT NULL,
	"review_status" text,
	"locked" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"data" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "files" (
	"id" text PRIMARY KEY NOT NULL,
	"mime_type" text NOT NULL,
	"size" integer NOT NULL,
	"content" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" bigint PRIMARY KEY NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"data" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" bigint PRIMARY KEY NOT NULL,
	"client_id" bigint,
	"name" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"data" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proposal_versions" (
	"id" bigint PRIMARY KEY NOT NULL,
	"comment_id" bigint NOT NULL,
	"version" integer NOT NULL,
	"status" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"data" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_links" (
	"key" text PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"deliverable_id" bigint,
	"version" integer,
	"active" boolean NOT NULL,
	"data" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb
);
--> statement-breakpoint
CREATE TABLE "sync_state" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"revision" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trash_items" (
	"id" bigint PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"deleted_at" bigint NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"data" jsonb NOT NULL
);
--> statement-breakpoint
CREATE INDEX "audit_events_comment_idx" ON "audit_events" USING btree ("comment_id");--> statement-breakpoint
CREATE INDEX "comments_deliverable_idx" ON "comments" USING btree ("deliverable_id");--> statement-breakpoint
CREATE INDEX "deliverables_project_idx" ON "deliverables" USING btree ("project_id","name");--> statement-breakpoint
CREATE INDEX "projects_client_idx" ON "projects" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "proposal_versions_comment_idx" ON "proposal_versions" USING btree ("comment_id");--> statement-breakpoint
CREATE INDEX "review_links_token_idx" ON "review_links" USING btree ("token");