ALTER TABLE "case_letterheads" ADD COLUMN "defaultLetterBody" TEXT;
ALTER TABLE "case_letterheads" ADD COLUMN "defaultPaper" TEXT NOT NULL DEFAULT 'A4';
