-- Blockchain addresses are case-insensitive. Keep the raw address for display,
-- but use the normalized form for NFT identity and lookups.
ALTER TABLE "NFTInstance" ADD COLUMN "normalizedTokenAddress" TEXT;

UPDATE "NFTInstance"
SET "normalizedTokenAddress" = LOWER("tokenAddress");

ALTER TABLE "NFTInstance" ALTER COLUMN "normalizedTokenAddress" SET NOT NULL;
ALTER TABLE "NFTInstance" DROP CONSTRAINT "NFTInstance_pkey";
ALTER TABLE "NFTInstance" ADD CONSTRAINT "NFTInstance_pkey" PRIMARY KEY ("normalizedTokenAddress", "id");
CREATE INDEX "NFTInstance_tokenAddress_idx" ON "NFTInstance"("tokenAddress");
