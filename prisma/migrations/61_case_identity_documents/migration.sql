-- CreateTable
CREATE TABLE "case_identity_documents" (
    "documentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "case_identity_documents_pkey" PRIMARY KEY ("documentId")
);

-- CreateIndex
CREATE INDEX "case_identity_documents_createdAt_idx" ON "case_identity_documents"("createdAt");

-- AddForeignKey
ALTER TABLE "case_identity_documents" ADD CONSTRAINT "case_identity_documents_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
