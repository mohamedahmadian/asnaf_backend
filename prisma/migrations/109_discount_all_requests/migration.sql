-- تخفیف «همه درخواست‌ها» روی انواع فعلی و انواعی که بعداً اضافه می‌شوند اعمال می‌شود.
ALTER TABLE "discounts"
ADD COLUMN "appliesToAllRequests" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "discounts_appliesToAllRequests_idx" ON "discounts"("appliesToAllRequests");
