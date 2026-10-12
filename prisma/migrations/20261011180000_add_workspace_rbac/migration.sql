-- Workspace ownership is mandatory for token registry records. Existing
-- unassigned rows are attached to the stable SYSTEM workspace first.
INSERT INTO "Workspace" ("name", "description", "createdAt", "updatedAt")
SELECT 'SYSTEM', 'Canonical cross-workspace blockchain registry', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "Workspace" WHERE "name" = 'SYSTEM');

UPDATE "TokenContract"
SET "workspaceId" = (SELECT "id" FROM "Workspace" WHERE "name" = 'SYSTEM')
WHERE "workspaceId" IS NULL;

ALTER TABLE "TokenContract" ALTER COLUMN "workspaceId" SET NOT NULL;

CREATE TABLE "AdminRole" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "system" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AdminRole_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AdminRole_name_key" ON "AdminRole"("name");

CREATE TABLE "AdminUserRole" (
  "adminUserId" TEXT NOT NULL,
  "roleId" TEXT NOT NULL,
  CONSTRAINT "AdminUserRole_pkey" PRIMARY KEY ("adminUserId", "roleId")
);
CREATE INDEX "AdminUserRole_roleId_idx" ON "AdminUserRole"("roleId");

CREATE TABLE "AdminUserWorkspace" (
  "adminUserId" TEXT NOT NULL,
  "workspaceId" INTEGER NOT NULL,
  CONSTRAINT "AdminUserWorkspace_pkey" PRIMARY KEY ("adminUserId", "workspaceId")
);
CREATE INDEX "AdminUserWorkspace_workspaceId_idx" ON "AdminUserWorkspace"("workspaceId");

CREATE TABLE "RoleMenuPermission" (
  "roleId" TEXT NOT NULL,
  "menuKey" TEXT NOT NULL,
  CONSTRAINT "RoleMenuPermission_pkey" PRIMARY KEY ("roleId", "menuKey")
);
CREATE INDEX "RoleMenuPermission_menuKey_idx" ON "RoleMenuPermission"("menuKey");

ALTER TABLE "AdminUserRole" ADD CONSTRAINT "AdminUserRole_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdminUserRole" ADD CONSTRAINT "AdminUserRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "AdminRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdminUserWorkspace" ADD CONSTRAINT "AdminUserWorkspace_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdminUserWorkspace" ADD CONSTRAINT "AdminUserWorkspace_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RoleMenuPermission" ADD CONSTRAINT "RoleMenuPermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "AdminRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "AdminRole" ("id", "name", "description", "system", "updatedAt")
VALUES
  ('role_superadmin', 'Superadmin', 'Full access to every menu and workspace', true, CURRENT_TIMESTAMP),
  ('role_admin', 'Admin', 'Default administrator access', true, CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;

INSERT INTO "AdminUserRole" ("adminUserId", "roleId")
SELECT user_row."id", CASE WHEN LOWER(user_row."role") = 'superadmin' THEN 'role_superadmin' ELSE 'role_admin' END
FROM "AdminUser" user_row
ON CONFLICT DO NOTHING;

INSERT INTO "RoleMenuPermission" ("roleId", "menuKey")
SELECT 'role_admin', menu_key
FROM unnest(ARRAY[
  'overview','analytics','reports','transactions','redemptions','tokens',
  'kap20-analysis','kap22-analysis','wallets','batch-logs','contracts',
  'workspaces','admin-users','roles','settings'
]) AS menu_key
ON CONFLICT DO NOTHING;

-- Existing non-superadmins retain access to current workspaces after migration.
INSERT INTO "AdminUserWorkspace" ("adminUserId", "workspaceId")
SELECT user_row."id", workspace_row."id"
FROM "AdminUser" user_row CROSS JOIN "Workspace" workspace_row
WHERE LOWER(user_row."role") <> 'superadmin'
ON CONFLICT DO NOTHING;
