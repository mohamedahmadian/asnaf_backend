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

## یوزر دیتابیس مدیریت و پورتال

به‌جای `postgres`، دو نقش جدا بسازید. اسکریپت روی لوکال و سرور یکی است.

```bash
cp scripts/db-users.env.example scripts/db-users.env
# PG* و رمز دو یوزر را در scripts/db-users.env بگذارید

npm run db:users          # لوکال
npm run db:users:server   # سرور
```

| نقش | پروژه | دسترسی |
|---|---|---|
| `asnaf_admin` | همین بک‌اند | مالک اسکیما، DDL + DML، `prisma migrate` |
| `asnaf_portal` | `asnaf-portal-backend` | فقط DML روی جداول پرونده/هویت؛ بدون ALTER/DROP و بدون ماژول‌های داخلی |

`DATABASE_URL` مدیریت را روی `asnaf_admin` و پورتال را روی `asnaf_portal` بگذارید. بعد از مایگریشن جدید، همان اسکریپت را دوباره اجرا کنید.

ورود پیش‌فرض: `admin` / `Admin1234`

API روی پیشوند `/api` است (پیش‌فرض پورت `3000`).
