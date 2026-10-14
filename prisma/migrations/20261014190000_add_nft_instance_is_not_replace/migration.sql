ALTER TABLE "NFTInstance"
ADD COLUMN "isNotReplace" BOOLEAN NOT NULL DEFAULT false;

-- Preserve the default Admin role's existing access to SYSTEM management pages.
INSERT INTO "RoleMenuPermission" ("roleId", "menuKey")
SELECT "id", 'nft-instances'
FROM "AdminRole"
WHERE "name" = 'Admin'
ON CONFLICT DO NOTHING;
