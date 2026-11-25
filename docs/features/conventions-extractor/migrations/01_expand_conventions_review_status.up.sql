-- Staged by sdd:data-model (conventions-extractor). Promoted by implement into the drizzle
-- migration 0014_* — edit server/src/db/schema/{knowledge,repos}.ts, run `pnpm db:generate`,
-- and check the generated SQL matches this file. ADR-0001.
ALTER TABLE "conventions" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "conventions" ADD COLUMN IF NOT EXISTS "original_rule" text;--> statement-breakpoint
ALTER TABLE "conventions" ADD COLUMN IF NOT EXISTS "category" text;--> statement-breakpoint
ALTER TABLE "conventions" ADD COLUMN IF NOT EXISTS "evidence_start_line" integer;--> statement-breakpoint
ALTER TABLE "conventions" ADD COLUMN IF NOT EXISTS "evidence_end_line" integer;--> statement-breakpoint
ALTER TABLE "conventions" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "repos" ADD COLUMN IF NOT EXISTS "conventions_scanned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "repos" ADD COLUMN IF NOT EXISTS "conventions_sample_count" integer;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "conventions_repo_status_idx" ON "conventions" USING btree ("repo_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "conventions_ws_idx" ON "conventions" USING btree ("workspace_id");
