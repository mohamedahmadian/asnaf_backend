-- مدارک شغلی روی پرونده؛ مدارک هویتی روی شخص می‌مانند.

CREATE TABLE "case_activity_documents" (
    "id" TEXT NOT NULL,
    "caseFileId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "case_activity_documents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "case_activity_document_versions" (
    "id" TEXT NOT NULL,
    "caseActivityDocumentId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "source" "DocumentSource" NOT NULL DEFAULT 'MANUAL',
    "storageKey" TEXT NOT NULL,
    "originalName" TEXT,
    "mimeType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "case_activity_document_versions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "case_activity_documents_caseFileId_idx" ON "case_activity_documents"("caseFileId");
CREATE INDEX "case_activity_documents_documentId_idx" ON "case_activity_documents"("documentId");
CREATE UNIQUE INDEX "case_activity_documents_caseFileId_documentId_key" ON "case_activity_documents"("caseFileId", "documentId");

CREATE INDEX "case_activity_document_versions_caseActivityDocumentId_idx" ON "case_activity_document_versions"("caseActivityDocumentId");
CREATE INDEX "case_activity_document_versions_storageKey_idx" ON "case_activity_document_versions"("storageKey");
CREATE INDEX "case_activity_document_versions_createdAt_idx" ON "case_activity_document_versions"("createdAt");
CREATE UNIQUE INDEX "case_activity_document_versions_caseActivityDocumentId_version_key" ON "case_activity_document_versions"("caseActivityDocumentId", "version");

CREATE INDEX "person_document_versions_storageKey_idx" ON "person_document_versions"("storageKey");

ALTER TABLE "case_activity_documents" ADD CONSTRAINT "case_activity_documents_caseFileId_fkey" FOREIGN KEY ("caseFileId") REFERENCES "case_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "case_activity_documents" ADD CONSTRAINT "case_activity_documents_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "case_activity_document_versions" ADD CONSTRAINT "case_activity_document_versions_caseActivityDocumentId_fkey" FOREIGN KEY ("caseActivityDocumentId") REFERENCES "case_activity_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- هر مدرکی که در تب حوزه فعالیت دیده می‌شود (ثابت الزامی یا وصل به شغل پرونده) روی همان پرونده کپی می‌شود.
INSERT INTO "case_activity_documents" ("id", "caseFileId", "documentId", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, cf."id", pd."documentId", pd."createdAt", pd."updatedAt"
FROM "person_documents" pd
JOIN "case_files" cf ON cf."userId" = pd."userId"
JOIN "documents" d ON d."id" = pd."documentId"
WHERE (d."isFixed" = true AND d."isRequired" = true)
   OR EXISTS (
     SELECT 1
     FROM "job_documents" jd
     WHERE jd."jobId" = cf."activityJobId"
       AND jd."documentId" = pd."documentId"
   );

INSERT INTO "case_activity_document_versions" (
    "id",
    "caseActivityDocumentId",
    "version",
    "source",
    "storageKey",
    "originalName",
    "mimeType",
    "byteSize",
    "createdAt"
)
SELECT
    gen_random_uuid()::text,
    cad."id",
    v."version",
    v."source",
    v."storageKey",
    v."originalName",
    v."mimeType",
    v."byteSize",
    v."createdAt"
FROM "person_document_versions" v
JOIN "person_documents" pd ON pd."id" = v."personDocumentId"
JOIN "case_files" cf ON cf."userId" = pd."userId"
JOIN "case_activity_documents" cad
  ON cad."caseFileId" = cf."id"
 AND cad."documentId" = pd."documentId";

-- مدرک فقط-شغلی از شخص برداشته می‌شود. مدرک هویتی سر جایش می‌ماند.
DELETE FROM "person_documents" pd
WHERE NOT EXISTS (
  SELECT 1 FROM "case_identity_documents" cid WHERE cid."documentId" = pd."documentId"
)
AND EXISTS (
  SELECT 1
  FROM "case_activity_documents" cad
  JOIN "case_files" cf ON cf."id" = cad."caseFileId"
  WHERE cf."userId" = pd."userId"
    AND cad."documentId" = pd."documentId"
);
