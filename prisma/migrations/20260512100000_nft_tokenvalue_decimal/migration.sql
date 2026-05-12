-- AlterTable: Change NFTInstance.tokenValue from TEXT to DECIMAL
-- Values that are valid numbers are preserved; non-numeric values become NULL
ALTER TABLE "NFTInstance"
  ALTER COLUMN "tokenValue" TYPE DECIMAL
  USING CASE
    WHEN "tokenValue" ~ '^[0-9]+\.?[0-9]*$' THEN "tokenValue"::DECIMAL
    ELSE NULL
  END;
