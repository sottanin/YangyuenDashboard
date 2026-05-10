-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
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
    "txValue" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "fee" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "block" BIGINT,
    "status" TEXT,
    "result" TEXT,
    "gasPrice" DECIMAL(65,30),
    "gasUsed" INTEGER,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RedemptionTransaction" (
    "id" TEXT NOT NULL,
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
    "txType" TEXT NOT NULL,
    "tokenId" TEXT,
    "notify" TEXT,
    "txValue" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "fee" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "block" BIGINT,
    "status" TEXT,
    "result" TEXT,
    "gasPrice" DECIMAL(65,30),
    "gasUsed" INTEGER,

    CONSTRAINT "RedemptionTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NFTInstance" (
    "id" TEXT NOT NULL,
    "isUnique" BOOLEAN NOT NULL DEFAULT false,
    "imageUrl" TEXT,
    "name" TEXT NOT NULL,
    "ownerHash" TEXT NOT NULL,
    "tokenAddress" TEXT NOT NULL,
    "tokenValue" TEXT,
    "visible" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "NFTInstance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Wallet" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3),
    "notify" TEXT,
    "balanceICC" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "balanceGreen" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "balanceTogether" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "balanceIntegrity" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "balanceFit" DECIMAL(65,30) NOT NULL DEFAULT 0,

    CONSTRAINT "Wallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TokenContract" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,

    CONSTRAINT "TokenContract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AddressContract" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,

    CONSTRAINT "AddressContract_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_txId_key" ON "Transaction"("txId");

-- CreateIndex
CREATE INDEX "Transaction_timestamp_idx" ON "Transaction"("timestamp");

-- CreateIndex
CREATE INDEX "Transaction_tokenName_idx" ON "Transaction"("tokenName");

-- CreateIndex
CREATE INDEX "Transaction_txType_idx" ON "Transaction"("txType");

-- CreateIndex
CREATE INDEX "Transaction_fromHash_idx" ON "Transaction"("fromHash");

-- CreateIndex
CREATE UNIQUE INDEX "RedemptionTransaction_txId_key" ON "RedemptionTransaction"("txId");

-- CreateIndex
CREATE INDEX "RedemptionTransaction_timestamp_idx" ON "RedemptionTransaction"("timestamp");

-- CreateIndex
CREATE INDEX "RedemptionTransaction_txType_idx" ON "RedemptionTransaction"("txType");

-- CreateIndex
CREATE UNIQUE INDEX "Wallet_walletId_key" ON "Wallet"("walletId");

-- CreateIndex
CREATE INDEX "Wallet_walletId_idx" ON "Wallet"("walletId");

-- CreateIndex
CREATE UNIQUE INDEX "TokenContract_name_key" ON "TokenContract"("name");

-- CreateIndex
CREATE UNIQUE INDEX "AddressContract_name_key" ON "AddressContract"("name");
