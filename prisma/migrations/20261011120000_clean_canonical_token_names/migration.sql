-- Keep token names and symbols as separate registry fields. Only rename the
-- exact legacy canonical rows, and skip a rename when its clean name is owned
-- by another row so this migration remains collision-safe and idempotent.
WITH canonical("normalizedAddress", "legacyName", "cleanName") AS (VALUES
  ('0x176458708c6c5f91745e19683aba93681e16110b', 'ICC-YANGYUEN (ICCYYN)', 'ICC-YANGYUEN'),
  ('0x765fdd2333003814b8b0c132bc0f40bf90d55bb9', 'Fit (FIT)', 'Fit'),
  ('0x3e19685894f822ec9e9caa752f459750a2b7ab44', 'Green (GRN)', 'Green'),
  ('0x4e407c438bf2cafc30e63dec17d77c9cc642cf93', 'Integrity (INT)', 'Integrity'),
  ('0xb4c77f6c02b661750c4386d3d391167b4d443ff7', 'Together (TGT)', 'Together')
)
UPDATE "TokenContract" AS token
SET "name" = canonical."cleanName"
FROM canonical
WHERE token."normalizedAddress" = canonical."normalizedAddress"
  AND token."name" = canonical."legacyName"
  AND NOT EXISTS (
    SELECT 1
    FROM "TokenContract" AS collision
    WHERE collision."name" = canonical."cleanName"
      AND collision."id" <> token."id"
  );
