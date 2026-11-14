-- Replace the stored Tutor model only if it still holds the old Sonnet default; a hand-chosen model stays.
UPDATE "settings" SET "value" = 'claude-opus-5-5' WHERE "key" = 'model' AND "value" = 'claude-sonnet-5-5';
