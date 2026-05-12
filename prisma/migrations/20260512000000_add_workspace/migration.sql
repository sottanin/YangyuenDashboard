-- CreateTable
CREATE TABLE "Workspace" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Workspace_name_key" ON "Workspace"("name");

-- Seed SYSTEM workspace
INSERT INTO "Workspace" ("name", "description", "updatedAt")
VALUES ('SYSTEM', 'System-wide shared contracts', CURRENT_TIMESTAMP);

-- AlterTable TokenContract
ALTER TABLE "TokenContract" ADD COLUMN "workspaceId" INTEGER;

-- AlterTable AddressContract
ALTER TABLE "AddressContract" ADD COLUMN "workspaceId" INTEGER;

-- Set all existing contracts to SYSTEM workspace
UPDATE "TokenContract" SET "workspaceId" = (SELECT "id" FROM "Workspace" WHERE "name" = 'SYSTEM' LIMIT 1);
UPDATE "AddressContract" SET "workspaceId" = (SELECT "id" FROM "Workspace" WHERE "name" = 'SYSTEM' LIMIT 1);

-- AddForeignKey
ALTER TABLE "TokenContract" ADD CONSTRAINT "TokenContract_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AddressContract" ADD CONSTRAINT "AddressContract_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;
