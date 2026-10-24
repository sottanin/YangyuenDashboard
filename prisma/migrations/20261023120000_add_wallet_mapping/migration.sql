CREATE TABLE "WalletMapping" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "normalizedUserId" TEXT NOT NULL,
  "walletAddress" TEXT NOT NULL,
  "normalizedWalletAddress" TEXT NOT NULL,
  "workspaceId" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WalletMapping_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WalletMapping_workspaceId_normalizedUserId_normalizedWalletAddress_key"
ON "WalletMapping"("workspaceId", "normalizedUserId", "normalizedWalletAddress");

CREATE INDEX "WalletMapping_workspaceId_normalizedUserId_idx"
ON "WalletMapping"("workspaceId", "normalizedUserId");

CREATE INDEX "WalletMapping_workspaceId_normalizedWalletAddress_idx"
ON "WalletMapping"("workspaceId", "normalizedWalletAddress");

ALTER TABLE "WalletMapping"
ADD CONSTRAINT "WalletMapping_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Preserve existing role behavior: roles that can manage Fitivity Data also
-- receive the adjacent Wallet Mapping menu. Superadmin bypasses stored grants.
INSERT INTO "RoleMenuPermission" ("roleId", "menuKey")
SELECT DISTINCT permission."roleId", 'wallet-mapping'
FROM "RoleMenuPermission" permission
WHERE permission."menuKey" = 'fitivity-data'
ON CONFLICT DO NOTHING;
