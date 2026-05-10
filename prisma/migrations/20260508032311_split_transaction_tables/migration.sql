/*
  Warnings:

  - You are about to drop the `Transaction` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
DROP TABLE "Transaction";

-- CreateTable
CREATE TABLE "TransactionHeader" (
    "id" TEXT NOT NULL,
    "txId" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "txValue" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "fee" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "block" BIGINT,
    "status" TEXT,
    "result" TEXT,
    "gasPrice" DECIMAL(65,30),
    "gasUsed" INTEGER,

    CONSTRAINT "TransactionHeader_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransactionDetail" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "txId" TEXT NOT NULL,
    "blockHash" TEXT,
    "fromHash" TEXT NOT NULL,
    "toHash" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "tokenAddress" TEXT NOT NULL,
    "tokenName" TEXT NOT NULL,
    "tokenSymbol" TEXT NOT NULL,
    "tokenType" TEXT NOT NULL,
    "decimals" INTEGER,
    "value" DECIMAL(65,30) NOT NULL,
    "txType" TEXT NOT NULL,
    "notify" TEXT,

    CONSTRAINT "TransactionDetail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemConfig" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "SystemConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TransactionHeader_txId_key" ON "TransactionHeader"("txId");

-- CreateIndex
CREATE INDEX "TransactionHeader_txId_idx" ON "TransactionHeader"("txId");

-- CreateIndex
CREATE INDEX "TransactionHeader_timestamp_idx" ON "TransactionHeader"("timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "TransactionDetail_key_key" ON "TransactionDetail"("key");

-- CreateIndex
CREATE INDEX "TransactionDetail_key_idx" ON "TransactionDetail"("key");

-- CreateIndex
CREATE INDEX "TransactionDetail_timestamp_idx" ON "TransactionDetail"("timestamp");

-- CreateIndex
CREATE INDEX "TransactionDetail_tokenName_idx" ON "TransactionDetail"("tokenName");

-- CreateIndex
CREATE INDEX "TransactionDetail_txType_idx" ON "TransactionDetail"("txType");

-- CreateIndex
CREATE INDEX "TransactionDetail_fromHash_idx" ON "TransactionDetail"("fromHash");

-- CreateIndex
CREATE UNIQUE INDEX "SystemConfig_key_key" ON "SystemConfig"("key");

-- AddForeignKey
ALTER TABLE "TransactionDetail" ADD CONSTRAINT "TransactionDetail_txId_fkey" FOREIGN KEY ("txId") REFERENCES "TransactionHeader"("txId") ON DELETE RESTRICT ON UPDATE CASCADE;
