CREATE TABLE "figma_connections" (
	"organization_id" text PRIMARY KEY NOT NULL,
	"figma_user_id" text NOT NULL,
	"handle" text NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"connected_by" text NOT NULL,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "figma_connections" ADD CONSTRAINT "figma_connections_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Closed to the Supabase REST API, like every table (see 0005_row_level_security.sql).
ALTER TABLE "figma_connections" ENABLE ROW LEVEL SECURITY;
