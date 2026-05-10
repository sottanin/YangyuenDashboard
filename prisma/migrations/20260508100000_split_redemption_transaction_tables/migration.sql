-- DropTable
DROP TABLE IF EXISTS "RedemptionTransaction";

-- CreateTable
CREATE TABLE "RedemptionTransactionHeader" (
    "id" TEXT NOT NULL,
    "txId" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "value" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "fee" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "block" BIGINT,
    "status" TEXT,
    "result" TEXT,
    "gasPrice" DECIMAL(65,30),
    "gasUsed" INTEGER,

    CONSTRAINT "RedemptionTransactionHeader_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RedemptionTransactionDetail" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "txId" TEXT NOT NULL,
    "blockHash" TEXT,
    "fromHash" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "toHash" TEXT NOT NULL,
    "tokenAddress" TEXT NOT NULL,
    "tokenName" TEXT NOT NULL,
    "tokenSymbol" TEXT NOT NULL,
    "tokenType" TEXT NOT NULL,
    "tokenId" TEXT,

    CONSTRAINT "RedemptionTransactionDetail_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RedemptionTransactionHeader_txId_key" ON "RedemptionTransactionHeader"("txId");

-- CreateIndex
CREATE INDEX "RedemptionTransactionHeader_txId_idx" ON "RedemptionTransactionHeader"("txId");

-- CreateIndex
CREATE INDEX "RedemptionTransactionHeader_timestamp_idx" ON "RedemptionTransactionHeader"("timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "RedemptionTransactionDetail_key_key" ON "RedemptionTransactionDetail"("key");

-- CreateIndex
CREATE INDEX "RedemptionTransactionDetail_key_idx" ON "RedemptionTransactionDetail"("key");

-- CreateIndex
CREATE INDEX "RedemptionTransactionDetail_timestamp_idx" ON "RedemptionTransactionDetail"("timestamp");

-- CreateIndex
CREATE INDEX "RedemptionTransactionDetail_txId_idx" ON "RedemptionTransactionDetail"("txId");

-- AddForeignKey
ALTER TABLE "RedemptionTransactionDetail" ADD CONSTRAINT "RedemptionTransactionDetail_txId_fkey" FOREIGN KEY ("txId") REFERENCES "RedemptionTransactionHeader"("txId") ON DELETE RESTRICT ON UPDATE CASCADE;
