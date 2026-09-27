# سامانه صدور مجوز فعالیت های اقتصادی — بک‌اند

احراز هویت، کاربران، نقش‌ها، اطلاعات پایه (کشور / استان / شهر) و دسترسی داشبورد.

## پیش‌نیاز

- Node.js 20+
- PostgreSQL

## راه‌اندازی

```bash
cp .env.example .env
# DATABASE_URL و JWT_SECRET را تنظیم کنید
npm install
npx prisma generate
npx prisma migrate deploy
npm run prisma:seed
npm run start:dev
```

ورود پیش‌فرض: `admin` / `Admin1234`

API روی پیشوند `/api` است (پیش‌فرض پورت `3000`).
