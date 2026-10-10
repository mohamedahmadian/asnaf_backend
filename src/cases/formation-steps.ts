import { ConflictException } from '@nestjs/common';
import {
  CaseRequestStatus,
  CaseRequestType,
  PremiseOwnership,
  Prisma,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** 0 هویت، 1 فعالیت، 2 محل، 3 استعلام، 4 اماکن، 5 بررسی مدیریت، 6 صدور */
export const INQUIRIES_FORMATION_STEP = 3;
export const PLACES_FORMATION_STEP = 4;
export const MANAGEMENT_FORMATION_STEP = 5;
export const ISSUANCE_FORMATION_STEP = 6;

function jalaliYear(date = new Date()) {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  if (month < 3 || (month === 3 && day < 21)) return year - 622;
  return year - 621;
}

function utcDateOnly(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addUtcYears(date: Date, years: number) {
  return new Date(Date.UTC(date.getUTCFullYear() + years, date.getUTCMonth(), date.getUTCDate()));
}

function isUniqueConflict(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

export async function nextRequestNumber(prisma: PrismaService | Prisma.TransactionClient) {
  const prefix = `REQ-${jalaliYear()}-`;
  for (let attempt = 0; attempt < 8; attempt++) {
    const count = await prisma.caseRequest.count({
      where: { number: { startsWith: prefix } },
    });
    const number = `${prefix}${String(count + 1 + attempt).padStart(6, '0')}`;
    const taken = await prisma.caseRequest.findUnique({ where: { number }, select: { id: true } });
    if (!taken) return number;
  }
  throw new ConflictException('صدور شماره درخواست انجام نشد');
}

export async function assignLicenseNumber(
  prisma: PrismaService | Prisma.TransactionClient,
  caseFileId: string,
  ownership: PremiseOwnership | null,
  leaseExpiresAt: Date | null,
) {
  const prefix = `${jalaliYear()}-`;
  const issuedAt = utcDateOnly(new Date());
  let expiresAt = addUtcYears(issuedAt, 1);
  if (ownership === PremiseOwnership.RENTED && leaseExpiresAt && leaseExpiresAt.getTime() < expiresAt.getTime()) {
    expiresAt = utcDateOnly(leaseExpiresAt);
  }
  for (let attempt = 0; attempt < 8; attempt++) {
    const count = await prisma.caseFile.count({
      where: { licenseNumber: { startsWith: prefix } },
    });
    const licenseNumber = `${prefix}${String(count + 1 + attempt).padStart(5, '0')}`;
    try {
      const updated = await prisma.caseFile.updateMany({
        where: { id: caseFileId, licenseNumber: null },
        data: { licenseNumber, licenseIssuedAt: issuedAt, licenseExpiresAt: expiresAt },
      });
      if (updated.count === 1) return licenseNumber;
      const row = await prisma.caseFile.findUnique({
        where: { id: caseFileId },
        select: { licenseNumber: true },
      });
      return row?.licenseNumber ?? null;
    } catch (error) {
      if (!isUniqueConflict(error)) throw error;
    }
  }
  throw new ConflictException('صدور شماره مجوز فعالیت اقتصادی انجام نشد');
}

/**
 * درخواست صدور را با مرحلهٔ پرونده هم‌گام می‌کند.
 * شماره مجوز فقط در تکمیل درخواست نوشته می‌شود.
 */
export async function syncIssuanceRequest(prisma: PrismaService, caseFileId: string) {
  const file = await prisma.caseFile.findUnique({
    where: { id: caseFileId },
    select: {
      id: true,
      formationStep: true,
      requests: {
        where: { type: CaseRequestType.ISSUANCE },
        take: 1,
        select: { id: true, status: true, formationStep: true },
      },
    },
  });
  if (!file || file.formationStep < 1) return;

  const existing = file.requests[0];
  const closed = existing?.status === CaseRequestStatus.ISSUED || existing?.status === CaseRequestStatus.COMPLETED;
  if (!existing) {
    for (let attempt = 0; attempt < 4; attempt++) {
      const number = await nextRequestNumber(prisma);
      try {
        await prisma.caseRequest.create({
          data: {
            caseFileId: file.id,
            type: CaseRequestType.ISSUANCE,
            number,
            status: CaseRequestStatus.OPEN,
            formationStep: file.formationStep,
          },
        });
        return;
      } catch (error) {
        if (!isUniqueConflict(error)) throw error;
        const winner = await prisma.caseRequest.findFirst({
          where: { caseFileId: file.id, type: CaseRequestType.ISSUANCE },
          select: { id: true },
        });
        if (winner) return;
      }
    }
    throw new ConflictException('صدور شماره درخواست انجام نشد');
  }

  if (closed || existing.formationStep === file.formationStep) return;

  await prisma.caseRequest.update({
    where: { id: existing.id },
    data: { formationStep: file.formationStep },
  });
}

/**
 * مرحلهٔ جاری پرونده را روی همین گام می‌گذارد.
 * رکورد مراحل بعد پاک نمی‌شود؛ فقط تا تأیید دوبارهٔ این گام قفل می‌مانند.
 * بعد از صدور مجوز فعالیت اقتصادی، مرحله به قبل برنمی‌گردد.
 */
export async function rewindFormationStep(prisma: PrismaService, caseFileId: string, step: number) {
  const row = await prisma.caseFile.findUnique({
    where: { id: caseFileId },
    select: { formationStep: true, licenseNumber: true },
  });
  if (!row || row.formationStep <= step) return row?.formationStep ?? step;
  if (row.licenseNumber && step < ISSUANCE_FORMATION_STEP) return row.formationStep;
  const updated = await prisma.caseFile.update({
    where: { id: caseFileId },
    data: { formationStep: step },
    select: { formationStep: true },
  });
  await syncIssuanceRequest(prisma, caseFileId);
  return updated.formationStep;
}
