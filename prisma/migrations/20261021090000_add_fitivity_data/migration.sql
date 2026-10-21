ALTER TABLE "Workspace" ADD COLUMN "externalId" TEXT;

CREATE UNIQUE INDEX "Workspace_externalId_key" ON "Workspace"("externalId");

UPDATE "Workspace"
SET "externalId" = '725d8d28-1eed-43ab-9eab-5bfe66df455f'
WHERE LOWER("name") = 'icc international';

UPDATE "Workspace"
SET "externalId" = 'c05cbf2f-02ee-4770-8121-6e6492faaf05'
WHERE LOWER("name") = 'yangyuen';

CREATE TABLE "FitivityData" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "metricType" TEXT NOT NULL,
  "totalValue" DECIMAL(30,12) NOT NULL,
  "count" INTEGER NOT NULL,
  "unit" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "window" TEXT NOT NULL,
  "workspaceId" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FitivityData_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FitivityData_userId_metricType_date_workspaceId_key"
ON "FitivityData"("userId", "metricType", "date", "workspaceId");

CREATE INDEX "FitivityData_workspaceId_date_idx" ON "FitivityData"("workspaceId", "date");
CREATE INDEX "FitivityData_metricType_date_idx" ON "FitivityData"("metricType", "date");

ALTER TABLE "FitivityData"
ADD CONSTRAINT "FitivityData_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
