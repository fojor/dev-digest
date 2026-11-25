ALTER TABLE "repos" ADD COLUMN "conventions_scanned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "repos" ADD COLUMN "conventions_sample_count" integer;--> statement-breakpoint
ALTER TABLE "conventions" ADD COLUMN "original_rule" text;--> statement-breakpoint
ALTER TABLE "conventions" ADD COLUMN "category" text;--> statement-breakpoint
ALTER TABLE "conventions" ADD COLUMN "status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "conventions" ADD COLUMN "evidence_start_line" integer;--> statement-breakpoint
ALTER TABLE "conventions" ADD COLUMN "evidence_end_line" integer;--> statement-breakpoint
ALTER TABLE "conventions" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE INDEX "conventions_repo_status_idx" ON "conventions" USING btree ("repo_id","status");--> statement-breakpoint
CREATE INDEX "conventions_ws_idx" ON "conventions" USING btree ("workspace_id");--> statement-breakpoint
-- Backfill (hand-added to the generated migration, between expand and contract). Idempotent.
UPDATE "conventions" SET "status" = 'accepted' WHERE "accepted" = true AND "status" = 'pending';--> statement-breakpoint
UPDATE "conventions" SET "original_rule" = "rule" WHERE "original_rule" IS NULL;
