CREATE TABLE "review_profiles" (
	"email" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- Closed to the Supabase REST API, like every table (see 0005_row_level_security.sql).
ALTER TABLE "review_profiles" ENABLE ROW LEVEL SECURITY;
