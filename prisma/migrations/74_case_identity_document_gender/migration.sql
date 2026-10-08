ALTER TABLE "case_identity_documents" ADD COLUMN "gender" "DocumentGender" NOT NULL DEFAULT 'BOTH';

UPDATE "case_identity_documents" AS link
SET "gender" = document."gender"
FROM "documents" AS document
WHERE document."id" = link."documentId";

CREATE INDEX "case_identity_documents_gender_idx" ON "case_identity_documents"("gender");
