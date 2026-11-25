DROP INDEX IF EXISTS "conventions_ws_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "conventions_repo_status_idx";--> statement-breakpoint
ALTER TABLE "repos" DROP COLUMN IF EXISTS "conventions_sample_count";--> statement-breakpoint
ALTER TABLE "repos" DROP COLUMN IF EXISTS "conventions_scanned_at";--> statement-breakpoint
ALTER TABLE "conventions" DROP COLUMN IF EXISTS "created_at";--> statement-breakpoint
ALTER TABLE "conventions" DROP COLUMN IF EXISTS "evidence_end_line";--> statement-breakpoint
ALTER TABLE "conventions" DROP COLUMN IF EXISTS "evidence_start_line";--> statement-breakpoint
ALTER TABLE "conventions" DROP COLUMN IF EXISTS "category";--> statement-breakpoint
ALTER TABLE "conventions" DROP COLUMN IF EXISTS "original_rule";--> statement-breakpoint
ALTER TABLE "conventions" DROP COLUMN IF EXISTS "status";
