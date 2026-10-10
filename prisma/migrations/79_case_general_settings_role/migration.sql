ALTER TABLE "case_general_settings" ADD COLUMN "editorRoleId" TEXT;

CREATE INDEX "case_general_settings_editorRoleId_idx" ON "case_general_settings"("editorRoleId");

ALTER TABLE "case_general_settings" ADD CONSTRAINT "case_general_settings_editorRoleId_fkey" FOREIGN KEY ("editorRoleId") REFERENCES "roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
