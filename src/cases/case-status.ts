import { CaseFileKind, CaseFileStatus, Prisma } from '../generated/prisma/client';
import { parseIsoDate, todayIsoDateTehran } from '../common/iso-date';

type Db = Prisma.TransactionClient | {
  caseFile: Prisma.CaseFileDelegate;
};

export type CaseStatusToday = Date;

export function caseStatusToday(now = new Date()): CaseStatusToday {
  return parseIsoDate(todayIsoDateTehran());
}

function utcDay(value: Date) {
  return Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
}

export function suspensionCoversDay(
  startsAt: Date,
  endsAt: Date | null,
  today: CaseStatusToday,
) {
  if (utcDay(startsAt) > utcDay(today)) return false;
  if (!endsAt) return true;
  return utcDay(endsAt) >= utcDay(today);
}

export function suspensionIsActive(
  row: { startsAt: Date; endsAt: Date | null; liftedAt?: Date | null },
  today: CaseStatusToday,
) {
  return !row.liftedAt && suspensionCoversDay(row.startsAt, row.endsAt, today);
}

/** انقضا وقتی تاریخ انقضا قبل از امروز باشد؛ خودِ امروز هنوز آخرین روز فعال است. */
export function isExpiredOn(expiresAt: Date | null | undefined, today: CaseStatusToday) {
  if (!expiresAt) return false;
  return utcDay(expiresAt) < utcDay(today);
}

const statusSelect = {
  id: true,
  kind: true,
  status: true,
  licenseExpiresAt: true,
  cardExpiresAt: true,
  hostCaseFileId: true,
  hostCaseFile: {
    select: {
      status: true,
      licenseExpiresAt: true,
    },
  },
  suspensions: {
    where: { liftedAt: null },
    select: { startsAt: true, endsAt: true, liftedAt: true },
  },
} satisfies Prisma.CaseFileSelect;

type StatusRow = Prisma.CaseFileGetPayload<{ select: typeof statusSelect }>;

export function computeCaseStatus(row: StatusRow, today: CaseStatusToday): CaseFileStatus {
  if (row.status === CaseFileStatus.REVOKED) return CaseFileStatus.REVOKED;
  if (row.suspensions.some((item) => suspensionIsActive(item, today))) {
    return CaseFileStatus.SUSPENDED;
  }
  const ownExpires =
    row.kind === CaseFileKind.STEWARDSHIP ? row.cardExpiresAt : row.licenseExpiresAt;
  if (isExpiredOn(ownExpires, today)) return CaseFileStatus.EXPIRED;
  if (row.kind === CaseFileKind.STEWARDSHIP && row.hostCaseFile) {
    if (row.hostCaseFile.status === CaseFileStatus.EXPIRED) return CaseFileStatus.EXPIRED;
    if (isExpiredOn(row.hostCaseFile.licenseExpiresAt, today)) return CaseFileStatus.EXPIRED;
  }
  return CaseFileStatus.ACTIVE;
}

async function syncOne(db: Db, caseFileId: string, today: CaseStatusToday) {
  const row = await db.caseFile.findUnique({
    where: { id: caseFileId },
    select: statusSelect,
  });
  if (!row) return null;
  const next = computeCaseStatus(row, today);
  if (next !== row.status) {
    await db.caseFile.update({
      where: { id: caseFileId },
      data: { status: next },
    });
  }
  return next;
}

/** وضعیت یک پرونده را از تعلیق و تاریخ انقضا می‌نویسد. برای مجوز، کارت‌های مباشرت وابسته هم همگام می‌شوند. */
export async function syncCaseStatus(
  db: Db,
  caseFileId: string,
  today: CaseStatusToday = caseStatusToday(),
) {
  const next = await syncOne(db, caseFileId, today);
  if (next == null) return null;
  const file = await db.caseFile.findUnique({
    where: { id: caseFileId },
    select: { kind: true },
  });
  if (file?.kind !== CaseFileKind.LICENSE) return next;
  const stewards = await db.caseFile.findMany({
    where: {
      hostCaseFileId: caseFileId,
      kind: CaseFileKind.STEWARDSHIP,
      status: { not: CaseFileStatus.REVOKED },
    },
    select: { id: true },
  });
  for (const steward of stewards) {
    await syncOne(db, steward.id, today);
  }
  return next;
}

/** همگام‌سازی همهٔ پرونده‌های غیر ابطال‌شده (جاب شبانه / استارت سرور). اول مجوزها، بعد مباشرت. */
export async function syncAllCaseStatuses(
  db: Db,
  today: CaseStatusToday = caseStatusToday(),
) {
  const licenses = await db.caseFile.findMany({
    where: { status: { not: CaseFileStatus.REVOKED }, kind: CaseFileKind.LICENSE },
    select: { id: true },
    orderBy: { id: 'asc' },
  });
  let changed = 0;
  for (const row of licenses) {
    const before = await db.caseFile.findUnique({
      where: { id: row.id },
      select: { status: true },
    });
    const next = await syncOne(db, row.id, today);
    if (before && next && before.status !== next) changed += 1;
  }
  const stewards = await db.caseFile.findMany({
    where: { status: { not: CaseFileStatus.REVOKED }, kind: CaseFileKind.STEWARDSHIP },
    select: { id: true },
    orderBy: { id: 'asc' },
  });
  for (const row of stewards) {
    const before = await db.caseFile.findUnique({
      where: { id: row.id },
      select: { status: true },
    });
    const next = await syncOne(db, row.id, today);
    if (before && next && before.status !== next) changed += 1;
  }
  return { total: licenses.length + stewards.length, changed };
}
