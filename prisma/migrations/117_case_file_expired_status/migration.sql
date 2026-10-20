-- وضعیت «منقضی» برای پرونده؛ مقداردهی پرونده‌های موجود با اولین اجرای CaseStatusService انجام می‌شود.
ALTER TYPE "CaseFileStatus" ADD VALUE IF NOT EXISTS 'EXPIRED' BEFORE 'REVOKED';
