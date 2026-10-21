ALTER TABLE "FitivityImportJob"
ADD COLUMN "overwrittenRecords" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "overwriteDuplicates" BOOLEAN NOT NULL DEFAULT false;
