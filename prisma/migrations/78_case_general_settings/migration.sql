CREATE TABLE "case_general_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "editAfterIssuance" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "case_general_settings_pkey" PRIMARY KEY ("id")
);
