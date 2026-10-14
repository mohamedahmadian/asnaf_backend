import { Injectable } from '@nestjs/common';
import { CaseInquiryStatus, CaseRequestType } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  currentCalendarYear,
  gregorianToJalali,
  jalaliMonthLength,
  jalaliToGregorian,
  reportCalendar,
  tehranDate,
  type ReportCalendar,
} from '../violations/calendar';
import { PlacesReportQueryDto } from './dto/places-report-query.dto';

const DAY_MS = 86_400_000;
const OVERDUE_LIMIT = 40;
const NEAR_DAYS = 2;

const REQUEST_TYPES = [
  CaseRequestType.ISSUANCE,
  CaseRequestType.RENEWAL,
  CaseRequestType.LOCATION_CHANGE,
  CaseRequestType.STEWARDSHIP,
] as const;

type BucketKey = 'd1' | 'd4' | 'd8' | 'd15';

type ReviewRow = {
  id: string;
  caseFileId: string;
  status: CaseInquiryStatus;
  referredAt: Date;
  decidedAt: Date | null;
  decidedById: string | null;
  decidedByName: string | null;
  requestType: CaseRequestType;
  fullName: string;
  nationalId: string;
  trackingCode: string | null;
};

type PeriodCounts = {
  referred: number;
  decided: number;
  approved: number;
  rejected: number;
  openEnd: number;
  resolutionRate: number | null;
  durations: number[];
};

function pad(value: number) {
  return String(value).padStart(2, '0');
}

function tehranDateOnly(value: Date) {
  const parts = tehranDate(value);
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

function tehranStart(year: number, month: number, day: number) {
  return new Date(`${year}-${pad(month)}-${pad(day)}T00:00:00+03:30`);
}

function calendarDay(value: Date, calendar: ReportCalendar) {
  const gregorian = tehranDate(value);
  if (calendar === 'gregorian') return gregorian;
  const jalali = gregorianToJalali(gregorian.year, gregorian.month, gregorian.day);
  return { year: jalali.year, month: jalali.month, day: jalali.day };
}

function periodBounds(calendar: ReportCalendar, year: number, month: number | null) {
  if (calendar === 'gregorian') {
    const startMonth = month ?? 1;
    const start = tehranStart(year, startMonth, 1);
    const end = month
      ? month === 12
        ? tehranStart(year + 1, 1, 1)
        : tehranStart(year, month + 1, 1)
      : tehranStart(year + 1, 1, 1);
    return { start, end };
  }
  const startMonth = month ?? 1;
  const startG = jalaliToGregorian(year, startMonth, 1);
  const endG = month
    ? month === 12
      ? jalaliToGregorian(year + 1, 1, 1)
      : jalaliToGregorian(year, month + 1, 1)
    : jalaliToGregorian(year + 1, 1, 1);
  return {
    start: tehranStart(startG.year, startG.month, startG.day),
    end: tehranStart(endG.year, endG.month, endG.day),
  };
}

function previousPeriod(year: number, month: number | null) {
  if (!month) return { year: year - 1, month: null as number | null };
  if (month === 1) return { year: year - 1, month: 12 };
  return { year, month: month - 1 };
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

function mean(values: number[]) {
  if (!values.length) return null;
  const total = values.reduce((sum, item) => sum + item, 0);
  return round1(total / values.length);
}

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const mid = Math.floor(sorted.length / 2);
  const value = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return round1(value);
}

function openAt(row: ReviewRow, instant: Date) {
  if (row.referredAt >= instant) return false;
  return !row.decidedAt || row.decidedAt >= instant;
}

function decidedIn(row: ReviewRow, start: Date, end: Date) {
  if (row.status === CaseInquiryStatus.PENDING || !row.decidedAt) return false;
  if (row.referredAt >= end) return false;
  return row.decidedAt >= start && row.decidedAt < end;
}

function durationDays(row: ReviewRow) {
  if (!row.decidedAt) return null;
  const elapsed = row.decidedAt.getTime() - row.referredAt.getTime();
  if (elapsed < 0) return null;
  return elapsed / DAY_MS;
}

function summarize(rows: ReviewRow[], start: Date, end: Date): PeriodCounts {
  let referred = 0;
  let approved = 0;
  let rejected = 0;
  let openStart = 0;
  let openEnd = 0;
  const durations: number[] = [];
  for (const row of rows) {
    if (row.referredAt >= start && row.referredAt < end) referred += 1;
    if (openAt(row, start)) openStart += 1;
    if (openAt(row, end)) openEnd += 1;
    if (!decidedIn(row, start, end)) continue;
    if (row.status === CaseInquiryStatus.APPROVED) approved += 1;
    else if (row.status === CaseInquiryStatus.REJECTED) rejected += 1;
    const days = durationDays(row);
    if (days != null) durations.push(days);
  }
  const decided = approved + rejected;
  const stock = openStart + referred;
  return {
    referred,
    decided,
    approved,
    rejected,
    openEnd,
    resolutionRate: stock === 0 ? null : Math.round((decided / stock) * 100),
    durations,
  };
}

function countMetric(value: number, previous: number) {
  return { value, previous, delta: value - previous };
}

function rateMetric(value: number | null, previous: number | null) {
  return {
    value,
    previous,
    delta: value == null || previous == null ? null : value - previous,
  };
}

function weekOfMonth(day: number) {
  return Math.min(5, Math.floor((day - 1) / 7) + 1);
}

function daysInMonth(calendar: ReportCalendar, year: number, month: number) {
  if (calendar === 'jalali') return jalaliMonthLength(year, month);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function bucketKey(overdueDays: number): BucketKey {
  if (overdueDays <= 3) return 'd1';
  if (overdueDays <= 7) return 'd4';
  if (overdueDays <= 14) return 'd8';
  return 'd15';
}

@Injectable()
export class CasePlacesReportService {
  constructor(private readonly prisma: PrismaService) {}

  async build(query: PlacesReportQueryDto, now = new Date()) {
    const calendar = reportCalendar();
    const currentYear = currentCalendarYear(calendar, now);
    const year = query.year ?? currentYear;
    const month = query.month ?? null;
    const office = await this.prisma.casePlacesOffice.findUnique({
      where: { id: 'default' },
      select: { responseDays: true },
    });
    const responseDays = office && office.responseDays > 0 ? office.responseDays : 5;
    const loaded = await this.prisma.casePlacesReview.findMany({
      where: { referredAt: { not: null } },
      select: {
        id: true,
        caseFileId: true,
        status: true,
        referredAt: true,
        decidedAt: true,
        decidedBy: { select: { id: true, fullName: true } },
        caseRequest: { select: { type: true } },
        caseFile: {
          select: {
            trackingCode: true,
            user: { select: { fullName: true, nationalId: true } },
          },
        },
      },
    });
    const rows: ReviewRow[] = [];
    for (const item of loaded) {
      if (!item.referredAt) continue;
      rows.push({
        id: item.id,
        caseFileId: item.caseFileId,
        status: item.status,
        referredAt: item.referredAt,
        decidedAt: item.decidedAt,
        decidedById: item.decidedBy?.id ?? null,
        decidedByName: item.decidedBy?.fullName ?? null,
        requestType: item.caseRequest.type,
        fullName: item.caseFile.user.fullName,
        nationalId: item.caseFile.user.nationalId ?? '',
        trackingCode: item.caseFile.trackingCode,
      });
    }

    const currentBounds = periodBounds(calendar, year, month);
    const previous = previousPeriod(year, month);
    const previousBounds = periodBounds(calendar, previous.year, previous.month);
    const current = summarize(rows, currentBounds.start, currentBounds.end);
    const prior = summarize(rows, previousBounds.start, previousBounds.end);

    const yearSet = new Set<number>([currentYear, year]);
    for (const row of rows) {
      yearSet.add(calendarDay(row.referredAt, calendar).year);
      if (row.decidedAt) yearSet.add(calendarDay(row.decidedAt, calendar).year);
    }

    const weeklyMonth = month ?? (year === currentYear ? calendarDay(now, calendar).month : 12);
    const weeklyBounds = periodBounds(calendar, year, weeklyMonth);
    const weekCount = weekOfMonth(daysInMonth(calendar, year, weeklyMonth));
    const weekly = Array.from({ length: weekCount }, (_, index) => ({
      week: index + 1,
      referred: 0,
      decided: 0,
    }));
    for (const row of rows) {
      if (row.referredAt >= weeklyBounds.start && row.referredAt < weeklyBounds.end) {
        const slot = weekly[weekOfMonth(calendarDay(row.referredAt, calendar).day) - 1];
        if (slot) slot.referred += 1;
      }
      if (decidedIn(row, weeklyBounds.start, weeklyBounds.end) && row.decidedAt) {
        const slot = weekly[weekOfMonth(calendarDay(row.decidedAt, calendar).day) - 1];
        if (slot) slot.decided += 1;
      }
    }

    const byType = REQUEST_TYPES.map((type) => {
      const matched = rows.filter((row) => row.requestType === type);
      const referred = matched.filter(
        (row) => row.referredAt >= currentBounds.start && row.referredAt < currentBounds.end,
      ).length;
      const decidedRows = matched.filter((row) => decidedIn(row, currentBounds.start, currentBounds.end));
      const durations = decidedRows.flatMap((row) => {
        const days = durationDays(row);
        return days == null ? [] : [days];
      });
      return {
        type,
        referred,
        decided: decidedRows.length,
        avgDays: mean(durations),
      };
    });

    const officers = new Map<
      string,
      { id: string; fullName: string; decided: number; approved: number; rejected: number; durations: number[] }
    >();
    for (const row of rows) {
      if (!decidedIn(row, currentBounds.start, currentBounds.end)) continue;
      const id = row.decidedById ?? 'unknown';
      const entry = officers.get(id) ?? {
        id,
        fullName: row.decidedByName ?? '',
        decided: 0,
        approved: 0,
        rejected: 0,
        durations: [],
      };
      entry.decided += 1;
      if (row.status === CaseInquiryStatus.APPROVED) entry.approved += 1;
      if (row.status === CaseInquiryStatus.REJECTED) entry.rejected += 1;
      const days = durationDays(row);
      if (days != null) entry.durations.push(days);
      officers.set(id, entry);
    }

    const backlog = this.backlog(rows, responseDays, now);

    return {
      calendar,
      year,
      month,
      previousYear: previous.year,
      previousMonth: previous.month,
      years: [...yearSet].sort((left, right) => right - left),
      responseDays,
      volume: {
        referred: countMetric(current.referred, prior.referred),
        decided: countMetric(current.decided, prior.decided),
        openEnd: countMetric(current.openEnd, prior.openEnd),
        approved: countMetric(current.approved, prior.approved),
        rejected: countMetric(current.rejected, prior.rejected),
        resolutionRate: rateMetric(current.resolutionRate, prior.resolutionRate),
      },
      monthly: Array.from({ length: 12 }, (_, index) => {
        const bounds = periodBounds(calendar, year, index + 1);
        const slice = summarize(rows, bounds.start, bounds.end);
        return { month: index + 1, referred: slice.referred, decided: slice.decided };
      }),
      weeklyMonth,
      weekly,
      byType,
      timing: {
        count: current.durations.length,
        mean: mean(current.durations),
        median: median(current.durations),
        max: current.durations.length ? round1(Math.max(...current.durations)) : null,
      },
      backlog,
      officers: [...officers.values()]
        .sort((left, right) => right.decided - left.decided || left.fullName.localeCompare(right.fullName, 'fa'))
        .map((item) => ({
          id: item.id,
          fullName: item.fullName,
          decided: item.decided,
          approved: item.approved,
          rejected: item.rejected,
          avgDays: mean(item.durations),
        })),
    };
  }

  private backlog(rows: ReviewRow[], responseDays: number, now: Date) {
    const limit = responseDays * DAY_MS;
    const pending = rows.filter((row) => row.status === CaseInquiryStatus.PENDING);
    let onTime = 0;
    let near = 0;
    let overdue = 0;
    let longestDays: number | null = null;
    const buckets: Record<BucketKey, number> = { d1: 0, d4: 0, d8: 0, d15: 0 };
    const late: {
      reviewId: string;
      caseFileId: string;
      fullName: string;
      nationalId: string;
      trackingCode: string | null;
      requestType: CaseRequestType;
      referredAt: string;
      ageDays: number;
      overdueDays: number;
    }[] = [];

    for (const row of pending) {
      const elapsed = now.getTime() - row.referredAt.getTime();
      const ageDays = Math.max(0, Math.floor(elapsed / DAY_MS));
      longestDays = longestDays == null ? ageDays : Math.max(longestDays, ageDays);
      if (elapsed > limit) {
        overdue += 1;
        const overdueDays = Math.max(1, ageDays - responseDays);
        buckets[bucketKey(overdueDays)] += 1;
        late.push({
          reviewId: row.id,
          caseFileId: row.caseFileId,
          fullName: row.fullName,
          nationalId: row.nationalId,
          trackingCode: row.trackingCode,
          requestType: row.requestType,
          referredAt: tehranDateOnly(row.referredAt),
          ageDays,
          overdueDays,
        });
        continue;
      }
      const remaining = limit - elapsed;
      if (remaining <= NEAR_DAYS * DAY_MS) near += 1;
      else onTime += 1;
    }

    late.sort((left, right) => right.overdueDays - left.overdueDays || left.ageDays - right.ageDays);
    return {
      pending: pending.length,
      onTime,
      near,
      overdue,
      longestDays,
      buckets: (['d1', 'd4', 'd8', 'd15'] as const).map((key) => ({
        key,
        count: buckets[key],
      })),
      items: late.slice(0, OVERDUE_LIMIT),
      hidden: Math.max(0, late.length - OVERDUE_LIMIT),
    };
  }
}
