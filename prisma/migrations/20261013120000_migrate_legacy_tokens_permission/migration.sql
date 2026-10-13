-- The legacy Tokens page has been replaced by the KAP-20 report at
-- /dashboard/tokens. Preserve existing role access while removing the retired
-- menu permission key. ON CONFLICT handles roles that already had both keys.
INSERT INTO "RoleMenuPermission" ("roleId", "menuKey")
SELECT legacy."roleId", 'kap20-analysis'
FROM "RoleMenuPermission" legacy
WHERE legacy."menuKey" = 'tokens'
ON CONFLICT ("roleId", "menuKey") DO NOTHING;

DELETE FROM "RoleMenuPermission"
WHERE "menuKey" = 'tokens';
