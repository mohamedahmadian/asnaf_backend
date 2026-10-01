ALTER TABLE "job_documents" ADD COLUMN "gender" "DocumentGender" NOT NULL DEFAULT 'BOTH';

UPDATE "job_documents" AS link
SET "gender" = document."gender"
FROM "documents" AS document
WHERE document."id" = link."documentId";
