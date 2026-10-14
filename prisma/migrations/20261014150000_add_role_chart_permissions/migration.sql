CREATE TABLE "RoleChartPermission" (
  "roleId" TEXT NOT NULL,
  "chartKey" TEXT NOT NULL,
  CONSTRAINT "RoleChartPermission_pkey" PRIMARY KEY ("roleId", "chartKey"),
  CONSTRAINT "RoleChartPermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "AdminRole"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "RoleChartPermission_chartKey_idx" ON "RoleChartPermission"("chartKey");

-- Existing menu access remains unchanged: every existing role receives every
-- currently available chart in each menu it could already open.
INSERT INTO "RoleChartPermission" ("roleId", "chartKey")
SELECT permission."roleId", chart."chartKey"
FROM "RoleMenuPermission" permission
JOIN (VALUES
  ('overview', 'overview.total-transactions'), ('overview', 'overview.total-gas-fee'), ('overview', 'overview.token-distributed'), ('overview', 'overview.token-redeemed'), ('overview', 'overview.nft-mint'), ('overview', 'overview.nft-burn'), ('overview', 'overview.point-token-distributed'), ('overview', 'overview.monthly-transactions'), ('overview', 'overview.transaction-history'),
  ('kap20-analysis', 'kap20.mint'), ('kap20-analysis', 'kap20.backup-wallet'), ('kap20-analysis', 'kap20.workspace-wallet'), ('kap20-analysis', 'kap20.distributor-pool'), ('kap20-analysis', 'kap20.user-wallet'), ('kap20-analysis', 'kap20.redemption-burn'), ('kap20-analysis', 'kap20.daily-transaction-count'), ('kap20-analysis', 'kap20.daily-transfer-volume'), ('kap20-analysis', 'kap20.activity-heatmap'), ('kap20-analysis', 'kap20.conversion-balance'), ('kap20-analysis', 'kap20.top-recipients'), ('kap20-analysis', 'kap20.top-holders'), ('kap20-analysis', 'kap20.transaction-history'),
  ('kap22-analysis', 'kap22.mint'), ('kap22-analysis', 'kap22.distributor-pool'), ('kap22-analysis', 'kap22.operation-pool'), ('kap22-analysis', 'kap22.user-wallet'), ('kap22-analysis', 'kap22.burn-wallet'), ('kap22-analysis', 'kap22.daily-transaction-count'), ('kap22-analysis', 'kap22.daily-transfer-volume'), ('kap22-analysis', 'kap22.activity-heatmap'), ('kap22-analysis', 'kap22.top-recipients'), ('kap22-analysis', 'kap22.top-holders'), ('kap22-analysis', 'kap22.transaction-history'),
  ('redemptions', 'nft.nft-mint'), ('redemptions', 'nft.nft-burn'), ('redemptions', 'nft.kap20-burn'), ('redemptions', 'nft.kap20-fee'), ('redemptions', 'nft.top-redemptions'), ('redemptions', 'nft.top-burns'), ('redemptions', 'nft.transaction-history')
) AS chart("menuKey", "chartKey") ON chart."menuKey" = permission."menuKey"
ON CONFLICT DO NOTHING;
