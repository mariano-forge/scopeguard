ALTER TABLE "audit_events" ADD COLUMN "deliverable_id" bigint;--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN "ip_address" text;--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN "user_agent" text;--> statement-breakpoint
CREATE INDEX "audit_events_deliverable_idx" ON "audit_events" USING btree ("organization_id","deliverable_id");