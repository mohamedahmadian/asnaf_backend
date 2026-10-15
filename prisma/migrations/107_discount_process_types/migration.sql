ALTER TABLE "discounts"
ADD COLUMN "processTypes" "CaseRequestType"[] NOT NULL
DEFAULT ARRAY[]::"CaseRequestType"[];
