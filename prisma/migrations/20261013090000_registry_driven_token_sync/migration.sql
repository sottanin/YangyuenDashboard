-- KAP-721 events belong exclusively in the redemption transaction tables.
CREATE TEMP TABLE "_Kap721NormalTxCleanup" AS
SELECT DISTINCT detail."txId"
FROM "TransactionDetail" detail
WHERE UPPER(detail."tokenType") IN ('ERC-721', 'KAP-721')
   OR EXISTS (
     SELECT 1
     FROM "TokenContract" token
     WHERE token.standard = 'KAP-721'
       AND token."normalizedAddress" = LOWER(detail."tokenAddress")
   );

DELETE FROM "TransactionDetail" detail
USING "_Kap721NormalTxCleanup" cleanup
WHERE detail."txId" = cleanup."txId"
  AND (
    UPPER(detail."tokenType") IN ('ERC-721', 'KAP-721')
    OR EXISTS (
      SELECT 1
      FROM "TokenContract" token
      WHERE token.standard = 'KAP-721'
        AND token."normalizedAddress" = LOWER(detail."tokenAddress")
    )
  );

DELETE FROM "TransactionHeader" header
USING "_Kap721NormalTxCleanup" cleanup
WHERE header."txId" = cleanup."txId"
  AND NOT EXISTS (
  SELECT 1 FROM "TransactionDetail" detail WHERE detail."txId" = header."txId"
);

-- The NFT contract source of truth is now Token Registry.
DELETE FROM "SystemConfig" WHERE key = 'redemptionNftContract';

-- Token IDs are unique only inside one NFT contract.
ALTER TABLE "NFTInstance" DROP CONSTRAINT "NFTInstance_pkey";
ALTER TABLE "NFTInstance" ADD CONSTRAINT "NFTInstance_pkey" PRIMARY KEY ("tokenAddress", "id");

DROP TABLE "_Kap721NormalTxCleanup";
