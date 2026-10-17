CREATE TABLE "request_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"window_start" timestamp with time zone DEFAULT now() NOT NULL,
	"count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
-- Closed to the Supabase REST API, like every table (see 0005_row_level_security.sql).
ALTER TABLE "request_limits" ENABLE ROW LEVEL SECURITY;
