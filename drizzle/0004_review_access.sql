CREATE TABLE "review_access_requests" (
	"link_key" text NOT NULL,
	"email" text NOT NULL,
	"status" text NOT NULL,
	"message" text,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	"decided_by" text,
	CONSTRAINT "review_access_requests_link_key_email_pk" PRIMARY KEY("link_key","email")
);
--> statement-breakpoint
CREATE TABLE "review_codes" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"code_hash" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"token_hash" text NOT NULL,
	"email" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "review_sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE INDEX "review_codes_email_idx" ON "review_codes" USING btree ("email","created_at");--> statement-breakpoint
CREATE INDEX "review_sessions_email_idx" ON "review_sessions" USING btree ("email");