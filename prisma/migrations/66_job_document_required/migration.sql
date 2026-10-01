ALTER TABLE "job_documents" ADD COLUMN "isRequired" BOOLEAN NOT NULL DEFAULT true;

UPDATE "job_documents" AS link
SET "isRequired" = document."isRequired"
FROM "documents" AS document
WHERE document."id" = link."documentId";
