-- Contract: the review status replaces the boolean (ADR-0001). Only after 02 has run.
ALTER TABLE "conventions" DROP COLUMN IF EXISTS "accepted";
