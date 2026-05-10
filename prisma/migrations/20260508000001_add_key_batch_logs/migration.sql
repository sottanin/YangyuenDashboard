-- Add key column to Transaction (backfill from txId, then add unique constraint)
ALTER TABLE "Transaction" ADD COLUMN "key" TEXT;
UPDATE "Transaction" SET "key" = "txId" WHERE "key" IS NULL;
ALTER TABLE "Transaction" ALTER COLUMN "key" SET NOT NULL;
CREATE UNIQUE INDEX "Transaction_key_key" ON "Transaction"("key");
CREATE INDEX "Transaction_key_idx" ON "Transaction"("key");

-- Drop old unique index on txId for Transaction
DROP INDEX IF EXISTS "Transaction_txId_key";

-- Add key column to RedemptionTransaction (backfill from txId, then add unique constraint)
ALTER TABLE "RedemptionTransaction" ADD COLUMN "key" TEXT;
UPDATE "RedemptionTransaction" SET "key" = "txId" WHERE "key" IS NULL;
ALTER TABLE "RedemptionTransaction" ALTER COLUMN "key" SET NOT NULL;
CREATE UNIQUE INDEX "RedemptionTransaction_key_key" ON "RedemptionTransaction"("key");
CREATE INDEX "RedemptionTransaction_key_idx" ON "RedemptionTransaction"("key");

-- Drop old unique index on txId for RedemptionTransaction
DROP INDEX IF EXISTS "RedemptionTransaction_txId_key";

-- Create BatchJobLog table
CREATE TABLE "BatchJobLog" (
    "id" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "tokenName" TEXT,
    "tokenAddress" TEXT,
    "totalFetched" INTEGER NOT NULL DEFAULT 0,
    "totalInserted" INTEGER NOT NULL DEFAULT 0,
    "totalUpdated" INTEGER NOT NULL DEFAULT 0,
    "pagesScanned" INTEGER NOT NULL DEFAULT 0,
    "stoppedReason" TEXT,
    "error" TEXT,

    CONSTRAINT "BatchJobLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BatchJobLog_startedAt_idx" ON "BatchJobLog"("startedAt");
CREATE INDEX "BatchJobLog_status_idx" ON "BatchJobLog"("status");
