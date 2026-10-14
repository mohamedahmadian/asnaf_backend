-- عکس کارت ملی، گذرنامه و شناسنامه از روی کاربر برداشته می‌شود.
-- عکس پرسنلی (photoId) برای کارت و داشبورد می‌ماند.
-- مدرک سیستمی PERSONNEL_PHOTO دیگر در فهرست مدارک هویتی نیست.

ALTER TABLE "users" DROP CONSTRAINT "users_nationalCardPhotoId_fkey";
ALTER TABLE "users" DROP CONSTRAINT "users_passportPhotoId_fkey";
ALTER TABLE "users" DROP CONSTRAINT "users_identityBookletPhotoId_fkey";

ALTER TABLE "users"
  DROP COLUMN "nationalCardPhotoId",
  DROP COLUMN "passportPhotoId",
  DROP COLUMN "identityBookletPhotoId";

DELETE FROM "person_documents"
WHERE "documentId" IN (SELECT "id" FROM "documents" WHERE "code" = 'PERSONNEL_PHOTO');

DELETE FROM "case_identity_documents"
WHERE "documentId" IN (SELECT "id" FROM "documents" WHERE "code" = 'PERSONNEL_PHOTO');

DELETE FROM "document_requirements"
WHERE "documentId" IN (SELECT "id" FROM "documents" WHERE "code" = 'PERSONNEL_PHOTO');

DELETE FROM "job_documents"
WHERE "documentId" IN (SELECT "id" FROM "documents" WHERE "code" = 'PERSONNEL_PHOTO');
