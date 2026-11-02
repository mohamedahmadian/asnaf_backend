ALTER TYPE "CaseRequestType" ADD VALUE IF NOT EXISTS 'REVOCATION';

ALTER TABLE "case_revocation_processes" ADD COLUMN "requestId" TEXT;

CREATE UNIQUE INDEX "case_revocation_processes_requestId_key" ON "case_revocation_processes"("requestId");

ALTER TABLE "case_revocation_processes" ADD CONSTRAINT "case_revocation_processes_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "case_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "case_revocation_requests" (
    "requestId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "case_revocation_requests_pkey" PRIMARY KEY ("requestId")
);

ALTER TABLE "case_revocation_requests" ADD CONSTRAINT "case_revocation_requests_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "case_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "case_revocation_request_files" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "originalName" TEXT,
    "mimeType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "case_revocation_request_files_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "case_revocation_request_files_requestId_idx" ON "case_revocation_request_files"("requestId");
CREATE INDEX "case_revocation_request_files_storageKey_idx" ON "case_revocation_request_files"("storageKey");

ALTER TABLE "case_revocation_request_files" ADD CONSTRAINT "case_revocation_request_files_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "case_revocation_requests"("requestId") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "case_revocation_process_files" (
    "id" TEXT NOT NULL,
    "processId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "originalName" TEXT,
    "mimeType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "case_revocation_process_files_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "case_revocation_process_files_processId_idx" ON "case_revocation_process_files"("processId");
CREATE INDEX "case_revocation_process_files_uploadedById_idx" ON "case_revocation_process_files"("uploadedById");
CREATE INDEX "case_revocation_process_files_storageKey_idx" ON "case_revocation_process_files"("storageKey");

ALTER TABLE "case_revocation_process_files" ADD CONSTRAINT "case_revocation_process_files_processId_fkey" FOREIGN KEY ("processId") REFERENCES "case_revocation_processes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "case_revocation_process_files" ADD CONSTRAINT "case_revocation_process_files_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
