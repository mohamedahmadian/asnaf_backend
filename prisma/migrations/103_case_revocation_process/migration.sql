CREATE TABLE "case_revocation_processes" (
    "id" TEXT NOT NULL,
    "caseFileId" TEXT NOT NULL,
    "amount" DECIMAL(18,0) NOT NULL,
    "revocationDate" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "case_revocation_processes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "case_revocation_letters" (
    "id" TEXT NOT NULL,
    "processId" TEXT NOT NULL,
    "inquiryCenterId" TEXT NOT NULL,
    "centerName" TEXT NOT NULL,
    "centerPhone" TEXT,
    "letterTitle" TEXT NOT NULL,
    "letterBody" TEXT NOT NULL,
    "letterNo" TEXT,
    "issuedAt" DATE,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "case_revocation_letters_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "case_revocation_processes_caseFileId_key" ON "case_revocation_processes"("caseFileId");
CREATE INDEX "case_revocation_processes_createdAt_idx" ON "case_revocation_processes"("createdAt");
CREATE UNIQUE INDEX "case_revocation_letters_letterNo_key" ON "case_revocation_letters"("letterNo");
CREATE UNIQUE INDEX "case_revocation_letters_processId_inquiryCenterId_key" ON "case_revocation_letters"("processId", "inquiryCenterId");
CREATE INDEX "case_revocation_letters_processId_sortOrder_idx" ON "case_revocation_letters"("processId", "sortOrder");

ALTER TABLE "case_revocation_processes" ADD CONSTRAINT "case_revocation_processes_caseFileId_fkey" FOREIGN KEY ("caseFileId") REFERENCES "case_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "case_revocation_letters" ADD CONSTRAINT "case_revocation_letters_processId_fkey" FOREIGN KEY ("processId") REFERENCES "case_revocation_processes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
