import {
  gregorianToJalali,
  jalaliMonthLength,
  jalaliToGregorian,
  tehranDate,
} from '../violations/calendar';

export const expiringRanges = ['this-week', 'two-weeks', 'three-weeks', 'this-month'] as const;

export type ExpiringRange = (typeof expiringRanges)[number];

export function utcDateOnly(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month - 1, day));
}

function addUtcDays(date: Date, days: number) {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

/** امروز تا پایان بازه؛ پرونده‌هایی که هنوز منقضی نشده‌اند. هفته از شنبه شروع می‌شود. */
export function expiringWindow(range: ExpiringRange, now = new Date()) {
  const todayParts = tehranDate(now);
  const start = utcDateOnly(todayParts.year, todayParts.month, todayParts.day);
  const weekDay = start.getUTCDay();
  const untilFriday = (5 - weekDay + 7) % 7;

  if (range === 'this-week') {
    return { start, end: addUtcDays(start, untilFriday), today: start };
  }
  if (range === 'two-weeks') {
    return { start, end: addUtcDays(start, 13), today: start };
  }
  if (range === 'three-weeks') {
    return { start, end: addUtcDays(start, 20), today: start };
  }

  const jalali = gregorianToJalali(todayParts.year, todayParts.month, todayParts.day);
  const lastDay = jalaliMonthLength(jalali.year, jalali.month);
  const endParts = jalaliToGregorian(jalali.year, jalali.month, lastDay);
  return {
    start,
    end: utcDateOnly(endParts.year, endParts.month, endParts.day),
    today: start,
  };
}

export function daysUntil(expiresAt: Date, today: Date) {
  const end = Date.UTC(expiresAt.getUTCFullYear(), expiresAt.getUTCMonth(), expiresAt.getUTCDate());
  return Math.round((end - today.getTime()) / 86_400_000);
}
