ALTER TABLE "TokenContract"
ADD COLUMN "aggregateAcrossWorkspaces" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "AddressContract"
ADD COLUMN "aggregateAcrossWorkspaces" BOOLEAN NOT NULL DEFAULT false;
