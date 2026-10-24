-- One Figma connection per member of an agency (US-054), instead of one per agency: the member who
-- connected the agency's account keeps it as their own.
ALTER TABLE "figma_connections" RENAME COLUMN "connected_by" TO "user_id";--> statement-breakpoint
ALTER TABLE "figma_connections" DROP CONSTRAINT "figma_connections_pkey";--> statement-breakpoint
ALTER TABLE "figma_connections" ADD CONSTRAINT "figma_connections_organization_id_user_id_pk" PRIMARY KEY("organization_id","user_id");--> statement-breakpoint
CREATE INDEX "figma_connections_figma_user_idx" ON "figma_connections" USING btree ("figma_user_id");
