import { getRequestLocale, isLtrLocale } from '../common/request-locale';

export type ReportCalendar = 'jalali' | 'gregorian';

export function reportCalendar(): ReportCalendar {
  return isLtrLocale(getRequestLocale()) ? 'gregorian' : 'jalali';
}

export function parseDateOnly(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

export function formatDateOnly(value: Date) {
  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, '0');
  const day = String(value.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function gregorianToJalali(gy: number, gm: number, gd: number) {
  const monthDays = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  const gy2 = gm > 2 ? gy + 1 : gy;
  let days =
    355666 +
    365 * gy +
    Math.floor((gy2 + 3) / 4) -
    Math.floor((gy2 + 99) / 100) +
    Math.floor((gy2 + 399) / 400) +
    gd +
    monthDays[gm - 1];
  let jy = -1595 + 33 * Math.floor(days / 12053);
  days %= 12053;
  jy += 4 * Math.floor(days / 1461);
  days %= 1461;
  if (days > 365) {
    jy += Math.floor((days - 1) / 365);
    days = (days - 1) % 365;
  }
  if (days < 186) {
    return {
      year: jy,
      month: 1 + Math.floor(days / 31),
      day: 1 + (days % 31),
    };
  }
  return {
    year: jy,
    month: 7 + Math.floor((days - 186) / 30),
    day: 1 + ((days - 186) % 30),
  };
}

function tehranDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tehran',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const read = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value);
  return { year: read('year'), month: read('month'), day: read('day') };
}

export function currentCalendarYear(calendar: ReportCalendar, now = new Date()) {
  const today = tehranDate(now);
  if (calendar === 'gregorian') return today.year;
  return gregorianToJalali(today.year, today.month, today.day).year;
}

export function calendarParts(value: Date, calendar: ReportCalendar) {
  const year = value.getUTCFullYear();
  const month = value.getUTCMonth() + 1;
  const day = value.getUTCDate();
  if (calendar === 'gregorian') return { year, month };
  const jalali = gregorianToJalali(year, month, day);
  return { year: jalali.year, month: jalali.month };
}
