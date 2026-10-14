INSERT INTO "roles" ("id", "code", "name", "description", "isSystem", "createdAt", "updatedAt")
VALUES (
    gen_random_uuid(),
    'PLACES_OFFICER',
    'اداره اماکن',
    'مسئول پیش‌فرض اداره اماکن؛ پرونده‌های دریافتی و گزارش اماکن',
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
)
ON CONFLICT ("code") DO UPDATE SET "isSystem" = true;

INSERT INTO "roles" ("id", "code", "name", "description", "isSystem", "createdAt", "updatedAt")
VALUES (
    gen_random_uuid(),
    'CASE_OPERATOR',
    'اپراتور پرونده',
    'تشکیل پرونده و مدیریت پرونده‌ها',
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
)
ON CONFLICT ("code") DO UPDATE SET "isSystem" = true;

INSERT INTO "role_permissions" ("roleId", "code")
SELECT "id", 'cases.places' FROM "roles" WHERE "code" = 'PLACES_OFFICER'
ON CONFLICT DO NOTHING;

INSERT INTO "role_permissions" ("roleId", "code")
SELECT "id", 'reports.places-cases' FROM "roles" WHERE "code" = 'PLACES_OFFICER'
ON CONFLICT DO NOTHING;

INSERT INTO "role_permissions" ("roleId", "code")
SELECT "id", 'cases.formation' FROM "roles" WHERE "code" = 'CASE_OPERATOR'
ON CONFLICT DO NOTHING;

INSERT INTO "role_permissions" ("roleId", "code")
SELECT "id", 'cases.management' FROM "roles" WHERE "code" = 'CASE_OPERATOR'
ON CONFLICT DO NOTHING;

UPDATE "case_places_office"
SET "officerRoleId" = (SELECT "id" FROM "roles" WHERE "code" = 'PLACES_OFFICER')
WHERE "id" = 'default' AND "officerRoleId" IS NULL;
