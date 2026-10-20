-- ثبت اولیهٔ درخواست تشکیل پرونده توسط متقاضی، پیش از تأیید مدیریت و ارجاع استعلام.
ALTER TABLE "case_requests" ADD COLUMN "intakeSubmittedAt" TIMESTAMP(3);
