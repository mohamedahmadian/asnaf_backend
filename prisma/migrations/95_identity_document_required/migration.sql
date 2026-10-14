ALTER TABLE "case_identity_documents" ADD COLUMN "isRequired" BOOLEAN NOT NULL DEFAULT true;

UPDATE "case_identity_documents" AS link
SET "isRequired" = document."isRequired"
FROM "documents" AS document
WHERE document."id" = link."documentId";

CREATE INDEX "case_identity_documents_isRequired_idx" ON "case_identity_documents"("isRequired");

DROP INDEX "documents_isRequired_idx";
DROP INDEX "documents_gender_idx";
DROP INDEX "documents_isFixed_idx";

ALTER TABLE "documents" DROP COLUMN "isRequired";
ALTER TABLE "documents" DROP COLUMN "gender";
ALTER TABLE "documents" DROP COLUMN "isFixed";
