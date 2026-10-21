CREATE TABLE "FitivityImportJob" (
  "id" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'VALIDATING',
  "progress" INTEGER NOT NULL DEFAULT 0,
  "processedRecords" INTEGER NOT NULL DEFAULT 0,
  "totalRecords" INTEGER NOT NULL DEFAULT 0,
  "newRecords" INTEGER NOT NULL DEFAULT 0,
  "duplicateRecords" INTEGER NOT NULL DEFAULT 0,
  "importedRecords" INTEGER NOT NULL DEFAULT 0,
  "error" TEXT,
  "validationErrors" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FitivityImportJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FitivityImportRow" (
  "id" BIGSERIAL NOT NULL,
  "jobId" TEXT NOT NULL,
  "rowNumber" INTEGER NOT NULL,
  "userId" TEXT NOT NULL,
  "metricType" TEXT NOT NULL,
  "totalValue" DECIMAL(30,12) NOT NULL,
  "count" INTEGER NOT NULL,
  "unit" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "window" TEXT NOT NULL,
  "workspaceId" INTEGER NOT NULL,
  "workspaceExternalId" TEXT NOT NULL,
  "workspaceName" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'New',
  CONSTRAINT "FitivityImportRow_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FitivityImportJob_status_createdAt_idx" ON "FitivityImportJob"("status", "createdAt");
CREATE UNIQUE INDEX "FitivityImportRow_jobId_rowNumber_key" ON "FitivityImportRow"("jobId", "rowNumber");
CREATE INDEX "FitivityImportRow_jobId_status_rowNumber_idx" ON "FitivityImportRow"("jobId", "status", "rowNumber");
ALTER TABLE "FitivityImportRow" ADD CONSTRAINT "FitivityImportRow_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "FitivityImportJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
