ALTER TABLE "municipal_fees"
ADD COLUMN "processTypes" "CaseRequestType"[] NOT NULL
DEFAULT ARRAY[]::"CaseRequestType"[];
