-- Preserve existing menu access when Redemption Fee becomes independently permissioned.
INSERT INTO "RoleChartPermission" ("roleId", "chartKey")
SELECT "roleId", 'overview.redemption-fee'
FROM "RoleMenuPermission"
WHERE "menuKey" = 'overview'
ON CONFLICT DO NOTHING;

INSERT INTO "RoleChartPermission" ("roleId", "chartKey")
SELECT "roleId", 'kap20.redemption-fee'
FROM "RoleMenuPermission"
WHERE "menuKey" = 'kap20-analysis'
ON CONFLICT DO NOTHING;
