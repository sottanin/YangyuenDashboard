ALTER TABLE "TokenContract" ADD COLUMN "imageKey" TEXT,
ADD COLUMN "imageMimeType" TEXT;

CREATE TABLE "ChartAnnotation" (
  "id" TEXT NOT NULL,
  "reportKey" TEXT NOT NULL,
  "tokenContractId" TEXT NOT NULL,
  "workspaceSelectionId" INTEGER,
  "date" DATE NOT NULL,
  "event" VARCHAR(500) NOT NULL,
  "createdByAdminId" TEXT NOT NULL,
  "updatedByAdminId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ChartAnnotation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ChartAnnotation_reportKey_tokenContractId_workspaceSelectionId_date_idx"
ON "ChartAnnotation"("reportKey", "tokenContractId", "workspaceSelectionId", "date");

ALTER TABLE "ChartAnnotation" ADD CONSTRAINT "ChartAnnotation_tokenContractId_fkey" FOREIGN KEY ("tokenContractId") REFERENCES "TokenContract"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChartAnnotation" ADD CONSTRAINT "ChartAnnotation_createdByAdminId_fkey" FOREIGN KEY ("createdByAdminId") REFERENCES "AdminUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ChartAnnotation" ADD CONSTRAINT "ChartAnnotation_updatedByAdminId_fkey" FOREIGN KEY ("updatedByAdminId") REFERENCES "AdminUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
