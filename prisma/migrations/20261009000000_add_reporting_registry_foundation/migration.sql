-- Reporting registry metadata is additive. Raw address casing remains in "address";
-- "normalizedAddress" exists only for comparison and indexed report filters.
ALTER TABLE "TokenContract"
  ADD COLUMN "normalizedAddress" TEXT,
  ADD COLUMN "symbol" TEXT,
  ADD COLUMN "standard" TEXT,
  ADD COLUMN "decimals" INTEGER,
  ADD COLUMN "role" TEXT NOT NULL DEFAULT 'OTHER',
  ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "effectiveFrom" TIMESTAMP(3),
  ADD COLUMN "effectiveTo" TIMESTAMP(3);

ALTER TABLE "AddressContract"
  ADD COLUMN "normalizedAddress" TEXT,
  ADD COLUMN "role" TEXT NOT NULL DEFAULT 'OTHER',
  ADD COLUMN "version" TEXT,
  ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "effectiveFrom" TIMESTAMP(3),
  ADD COLUMN "effectiveTo" TIMESTAMP(3);

UPDATE "TokenContract" SET "normalizedAddress" = lower("address") WHERE "normalizedAddress" IS NULL;
UPDATE "AddressContract" SET "normalizedAddress" = lower("address") WHERE "normalizedAddress" IS NULL;

-- Do not guess which duplicate is authoritative. Abort with an actionable error
-- before adding uniqueness so operators can reconcile registry data explicitly.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "TokenContract"
    GROUP BY "normalizedAddress"
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'TokenContract contains duplicate case-insensitive addresses. Reconcile duplicate normalizedAddress rows before applying this migration.'
      USING ERRCODE = '23505';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "AddressContract"
    GROUP BY "normalizedAddress"
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'AddressContract contains duplicate case-insensitive addresses. Reconcile duplicate normalizedAddress rows before applying this migration.'
      USING ERRCODE = '23505';
  END IF;
END $$;

ALTER TABLE "TokenContract" ALTER COLUMN "normalizedAddress" SET NOT NULL;
ALTER TABLE "AddressContract" ALTER COLUMN "normalizedAddress" SET NOT NULL;

CREATE UNIQUE INDEX "TokenContract_normalizedAddress_key" ON "TokenContract"("normalizedAddress");
CREATE INDEX "TokenContract_workspaceId_active_idx" ON "TokenContract"("workspaceId", "active");
CREATE INDEX "TokenContract_role_active_idx" ON "TokenContract"("role", "active");
CREATE UNIQUE INDEX "AddressContract_normalizedAddress_key" ON "AddressContract"("normalizedAddress");
CREATE INDEX "AddressContract_workspaceId_active_idx" ON "AddressContract"("workspaceId", "active");
CREATE INDEX "AddressContract_role_active_idx" ON "AddressContract"("role", "active");

CREATE INDEX "TransactionDetail_tokenAddress_timestamp_idx" ON "TransactionDetail"("tokenAddress", "timestamp");
CREATE INDEX "TransactionDetail_toHash_timestamp_idx" ON "TransactionDetail"("toHash", "timestamp");
CREATE INDEX "RedemptionTransactionDetail_tokenAddress_timestamp_idx" ON "RedemptionTransactionDetail"("tokenAddress", "timestamp");
CREATE INDEX "RedemptionTransactionDetail_fromHash_timestamp_idx" ON "RedemptionTransactionDetail"("fromHash", "timestamp");
CREATE INDEX "RedemptionTransactionDetail_toHash_timestamp_idx" ON "RedemptionTransactionDetail"("toHash", "timestamp");

INSERT INTO "Workspace" ("name", "description", "createdAt", "updatedAt")
VALUES ('SYSTEM', 'Canonical shared contracts and system wallets', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO UPDATE
SET "description" = COALESCE("Workspace"."description", EXCLUDED."description"),
    "updatedAt" = CURRENT_TIMESTAMP;

-- Address identity wins over display name. Update matching legacy rows in place
-- so their original name and checksum casing remain available for audit.
UPDATE "TokenContract" AS existing SET
  "symbol" = canonical.symbol,
  "standard" = canonical.standard,
  "decimals" = canonical.decimals,
  "role" = canonical.role,
  "active" = true,
  "effectiveFrom" = COALESCE(existing."effectiveFrom", '2025-10-29T07:02:37.000Z'),
  "workspaceId" = (SELECT "id" FROM "Workspace" WHERE "name" = 'SYSTEM')
FROM (VALUES
  ('0x176458708c6c5f91745e19683aba93681e16110b', 'ICCYYN', 'KAP-20', 18, 'PRIMARY_TOKEN'),
  ('0x765fdd2333003814b8b0c132bc0f40bf90d55bb9', 'FIT', 'KAP-22', 18, 'POINT_TOKEN'),
  ('0x3e19685894f822ec9e9caa752f459750a2b7ab44', 'GRN', 'KAP-22', 18, 'POINT_TOKEN'),
  ('0x4e407c438bf2cafc30e63dec17d77c9cc642cf93', 'INT', 'KAP-22', 18, 'POINT_TOKEN'),
  ('0xb4c77f6c02b661750c4386d3d391167b4d443ff7', 'TGT', 'KAP-22', 18, 'POINT_TOKEN'),
  ('0xe089bc4b774b03f1d5f8c3f624603643f0718b62', 'NFT', 'KAP-721', NULL, 'REDEMPTION_NFT')
) AS canonical(address, symbol, standard, decimals, role)
WHERE existing."normalizedAddress" = canonical.address;

WITH canonical(id, name, address, symbol, standard, decimals, role) AS (VALUES
  ('system-token-iccyyn', 'ICC-YANGYUEN', '0x176458708C6C5F91745E19683AbA93681e16110B', 'ICCYYN', 'KAP-20', 18, 'PRIMARY_TOKEN'),
  ('system-token-fit', 'Fit', '0x765fdD2333003814b8B0c132bC0f40bf90D55BB9', 'FIT', 'KAP-22', 18, 'POINT_TOKEN'),
  ('system-token-grn', 'Green', '0x3e19685894F822ec9E9caa752f459750a2B7ab44', 'GRN', 'KAP-22', 18, 'POINT_TOKEN'),
  ('system-token-int', 'Integrity', '0x4E407c438bF2Cafc30e63dec17d77c9cc642cf93', 'INT', 'KAP-22', 18, 'POINT_TOKEN'),
  ('system-token-tgt', 'Together', '0xB4c77F6c02b661750c4386d3D391167B4D443fF7', 'TGT', 'KAP-22', 18, 'POINT_TOKEN'),
  ('system-token-redemption-nft', 'Redemption NFT', '0xe089bc4b774b03f1D5F8C3f624603643F0718B62', 'NFT', 'KAP-721', NULL, 'REDEMPTION_NFT')
)
INSERT INTO "TokenContract" ("id", "name", "address", "normalizedAddress", "symbol", "standard", "decimals", "role", "active", "effectiveFrom", "workspaceId")
SELECT id,
  CASE WHEN EXISTS (SELECT 1 FROM "TokenContract" named WHERE named."name" = canonical.name)
    THEN canonical.name || ' [' || substring(lower(canonical.address) from 3 for 8) || ']'
    ELSE canonical.name END,
  address, lower(address), symbol, standard, decimals, role, true, '2025-10-29T07:02:37.000Z', (SELECT "id" FROM "Workspace" WHERE "name" = 'SYSTEM')
FROM canonical
WHERE NOT EXISTS (SELECT 1 FROM "TokenContract" existing WHERE existing."normalizedAddress" = lower(canonical.address));

UPDATE "AddressContract" AS existing SET
  "role" = canonical.role,
  "version" = canonical.version,
  "active" = true,
  "effectiveFrom" = COALESCE(existing."effectiveFrom", '2025-10-29T07:02:37.000Z'),
  "workspaceId" = (SELECT "id" FROM "Workspace" WHERE "name" = 'SYSTEM')
FROM (VALUES
  ('0x0000000000000000000000000000000000000000', 'ZERO', NULL),
  ('0xcddfb85f74f48d7c90b4126e01007583503537fd', 'INITIAL_MINT', NULL),
  ('0xeddf22523776d06b46dcc96768a8dfd01f5b1ff6', 'MAIN', NULL),
  ('0x11fa8be7383aed9549eb1693295f4a4a4b8c42ac', 'WORKSPACE', NULL),
  ('0xd8ff598242e87ea33055e2bae38e5e7855206ea1', 'DISTRIBUTOR_POOL', NULL),
  ('0x5375d9b6d9289f4b6c8c59734713764c4c1127d9', 'OPERATION_POOL', NULL),
  ('0x3270a1658e43fc5d7a0ae947a552ca916f76a05e', 'LOYALTY_SWAP', NULL),
  ('0x56ef6445cc79801b3a6b41319d996cff8f901ac2', 'MARKETPLACE', 'v1'),
  ('0x032b2668eef54b165a2d969eab94f57d2bf546e4', 'MARKETPLACE', 'v2'),
  ('0x2dd756befd774acb510a4389dbfdd34cbaea1f0b', 'MARKETPLACE_FEE', NULL)
) AS canonical(address, role, version)
WHERE existing."normalizedAddress" = canonical.address;

WITH canonical(id, name, address, role, version) AS (VALUES
  ('system-address-zero', 'Zero Wallet', '0x0000000000000000000000000000000000000000', 'ZERO', NULL),
  ('system-address-initial-mint', 'Initial Mint Wallet', '0xCddFB85F74F48D7C90B4126e01007583503537fD', 'INITIAL_MINT', NULL),
  ('system-address-main', 'Main Wallet', '0xeDdF22523776d06B46DCc96768A8DfD01f5B1ff6', 'MAIN', NULL),
  ('system-address-workspace', 'Workspace Wallet', '0x11fa8Be7383AeD9549EB1693295F4a4A4B8C42AC', 'WORKSPACE', NULL),
  ('system-address-distributor', 'DistributorPool', '0xd8FF598242e87EA33055E2bAE38e5E7855206EA1', 'DISTRIBUTOR_POOL', NULL),
  ('system-address-operation', 'OperationPool', '0x5375D9B6d9289F4b6c8C59734713764c4c1127D9', 'OPERATION_POOL', NULL),
  ('system-address-swap', 'Loyalty Swap', '0x3270a1658E43fc5d7A0aE947A552cA916F76A05e', 'LOYALTY_SWAP', NULL),
  ('system-address-market-v1', 'Loyalty Marketplace v1', '0x56ef6445CC79801b3a6b41319D996cFf8f901ac2', 'MARKETPLACE', 'v1'),
  ('system-address-market-v2', 'Loyalty Marketplace v2', '0x032B2668EEf54b165A2D969Eab94f57d2bf546E4', 'MARKETPLACE', 'v2'),
  ('system-address-market-fee', 'Loyalty Marketplace Fee', '0x2Dd756BEfD774AcB510a4389DBFDd34CBAeA1F0b', 'MARKETPLACE_FEE', NULL)
)
INSERT INTO "AddressContract" ("id", "name", "address", "normalizedAddress", "role", "version", "active", "effectiveFrom", "workspaceId")
SELECT id,
  CASE WHEN EXISTS (SELECT 1 FROM "AddressContract" named WHERE named."name" = canonical.name)
    THEN canonical.name || ' [' || substring(lower(canonical.address) from 3 for 8) || ']'
    ELSE canonical.name END,
  address, lower(address), role, version, true, '2025-10-29T07:02:37.000Z', (SELECT "id" FROM "Workspace" WHERE "name" = 'SYSTEM')
FROM canonical
WHERE NOT EXISTS (SELECT 1 FROM "AddressContract" existing WHERE existing."normalizedAddress" = lower(canonical.address));

INSERT INTO "SystemConfig" ("id", "key", "value") VALUES
  ('system-config-timezone', 'reportingTimezone', 'Asia/Bangkok'),
  ('system-config-history-start', 'businessHistoryStart', '2025-10-29T14:02:37+07:00'),
  ('system-config-range', 'defaultReportRangeDays', '30'),
  ('system-config-marketplace', 'aggregateMarketplaceVersions', 'true'),
  ('system-config-nft', 'redemptionNftContract', '0xe089bc4b774b03f1D5F8C3f624603643F0718B62'),
  ('system-config-cutoff', 'batchCutoffDays', '7')
ON CONFLICT ("key") DO NOTHING;
