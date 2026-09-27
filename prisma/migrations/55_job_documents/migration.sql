-- CreateTable
CREATE TABLE "job_documents" (
    "jobId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,

    CONSTRAINT "job_documents_pkey" PRIMARY KEY ("jobId","documentId")
);

-- CreateIndex
CREATE INDEX "job_documents_documentId_idx" ON "job_documents"("documentId");

-- AddForeignKey
ALTER TABLE "job_documents" ADD CONSTRAINT "job_documents_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_documents" ADD CONSTRAINT "job_documents_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
