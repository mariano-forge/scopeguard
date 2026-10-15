CREATE TABLE "agency_storage" (
	"organization_id" text PRIMARY KEY NOT NULL,
	"account_url" text,
	"container" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stored_files" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"container" text NOT NULL,
	"path" text NOT NULL,
	"sha256" text NOT NULL,
	"mime_type" text NOT NULL,
	"size" bigint NOT NULL,
	"original_name" text,
	"uploaded_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agency_storage" ADD CONSTRAINT "agency_storage_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stored_files" ADD CONSTRAINT "stored_files_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stored_files_organization_idx" ON "stored_files" USING btree ("organization_id","sha256");