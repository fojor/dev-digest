-- Reverse backfill: restore the boolean from status (rejected maps to false). Runs before
-- 01 down drops "status"; requires "accepted" to exist again (03 down re-adds it).
UPDATE "conventions" SET "accepted" = ("status" = 'accepted');
