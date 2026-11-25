-- Backfill (hand-added to the generated migration, between expand and contract). Idempotent.
UPDATE "conventions" SET "status" = 'accepted' WHERE "accepted" = true AND "status" = 'pending';--> statement-breakpoint
UPDATE "conventions" SET "original_rule" = "rule" WHERE "original_rule" IS NULL;
