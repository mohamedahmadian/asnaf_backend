import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  CaseInquiryStatus,
  CaseRequestStatus,
  CaseRequestType,
  DocumentGender,
  Prisma,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  ISSUANCE_FORMATION_STEP,
  MANAGEMENT_FORMATION_STEP,
  assignLicenseNumber,
  nextRequestNumber,
} from './formation-steps';

export type Db = PrismaService | Prisma.TransactionClient;

const PROCESS_TYPES = [
  CaseRequestType.ISSUANCE,
  CaseRequestType.RENEWAL,
  CaseRequestType.LOCATION_CHANGE,
] as const;

export type ProcessType = (typeof PROCESS_TYPES)[number];

export function isProcessType(value: string): value is ProcessType {
  return (PROCESS_TYPES as readonly string[]).includes(value);
}

export function requestIsOpen(status: CaseRequestStatus) {
  return status === CaseRequestStatus.OPEN;
}

export function requestIsDone(status: CaseRequestStatus) {
  return status === CaseRequestStatus.ISSUED || status === CaseRequestStatus.COMPLETED;
}

export async function findOpenRequest(prisma: Db, caseFileId: string) {
  return prisma.caseRequest.findFirst({
    where: { caseFileId, status: CaseRequestStatus.OPEN },
  });
}

export function matchesDocumentGender(
  gender: DocumentGender,
  personGender: 'MALE' | 'FEMALE' | null,
) {
  return gender === DocumentGender.BOTH || !personGender || gender === personGender;
}

export async function resolveDocumentRequirements(
  prisma: Db,
  requestType: CaseRequestType,
  jobId: string | null,
  personGender: 'MALE' | 'FEMALE' | null,
) {
  const rows = await prisma.documentRequirement.findMany({
    where: {
      requestType,
      OR: [{ jobId: null }, ...(jobId ? [{ jobId }] : [])],
    },
    select: {
      gender: true,
      isRequired: true,
      document: { select: { id: true, code: true, title: true } },
    },
  });
  const byId = new Map<
    string,
    { id: string; code: string | null; title: string; gender: DocumentGender; isRequired: boolean }
  >();
  for (const row of rows) {
    if (!matchesDocumentGender(row.gender, personGender)) continue;
    const current = byId.get(row.document.id);
    if (!current) {
      byId.set(row.document.id, {
        id: row.document.id,
        code: row.document.code,
        title: row.document.title,
        gender: row.gender,
        isRequired: row.isRequired,
      });
      continue;
    }
    if (row.isRequired) current.isRequired = true;
  }
  return [...byId.values()].sort((left, right) => left.title.localeCompare(right.title, 'fa'));
}

export async function resolveInquiryCenterIds(
  prisma: Db,
  requestType: CaseRequestType,
  jobId: string | null,
) {
  const rows = await prisma.inquiryRequirement.findMany({
    where: {
      requestType,
      inquiryCenter: { isActive: true },
      OR: [{ jobId: null }, ...(jobId ? [{ jobId }] : [])],
    },
    select: { inquiryCenterId: true },
  });
  return [...new Set(rows.map((row) => row.inquiryCenterId))];
}

function utcDateOnly(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addUtcYears(date: Date, years: number) {
  return new Date(Date.UTC(date.getUTCFullYear() + years, date.getUTCMonth(), date.getUTCDate()));
}

/** بازهٔ تمدید فقط از تاریخ انقضای فعلی پرونده تا یک سال بعد؛ اجاره در آن دخیل نیست. */
export function renewalWindow(currentExpiresAt: Date) {
  const currentExpiry = utcDateOnly(currentExpiresAt);
  return {
    nextIssuedAt: currentExpiry,
    nextExpiresAt: addUtcYears(currentExpiry, 1),
  };
}

export function renewalTermsFor(currentIssuedAt: Date, currentExpiresAt: Date, today = new Date()) {
  const opened = utcDateOnly(today);
  const currentExpiry = utcDateOnly(currentExpiresAt);
  const delayDays = Math.floor((opened.getTime() - currentExpiry.getTime()) / 86_400_000);
  return {
    currentIssuedAt: utcDateOnly(currentIssuedAt),
    currentExpiresAt: currentExpiry,
    ...renewalWindow(currentExpiry),
    delayDays: delayDays > 0 ? delayDays : 0,
  };
}

export async function alignStoredRenewalTerms<T extends { currentExpiresAt: Date; nextIssuedAt: Date; nextExpiresAt: Date }>(
  prisma: Db,
  requestId: string,
  terms: T,
) {
  const window = renewalWindow(terms.currentExpiresAt);
  const same =
    utcDateOnly(terms.nextIssuedAt).getTime() === window.nextIssuedAt.getTime() &&
    utcDateOnly(terms.nextExpiresAt).getTime() === window.nextExpiresAt.getTime();
  if (same) return terms;
  const updated = await prisma.caseRenewalTerms.update({
    where: { requestId },
    data: window,
  });
  return { ...terms, ...updated };
}

export async function rewindRequestPhase(prisma: Db, caseRequestId: string, phase: number) {
  const request = await prisma.caseRequest.findUnique({
    where: { id: caseRequestId },
    select: { id: true, status: true, formationStep: true, type: true, caseFileId: true },
  });
  if (!request || !requestIsOpen(request.status) || request.formationStep <= phase) return;
  await prisma.caseRequest.update({
    where: { id: request.id },
    data: { formationStep: phase },
  });
  if (request.type !== CaseRequestType.ISSUANCE) return;
  const file = await prisma.caseFile.findUnique({
    where: { id: request.caseFileId },
    select: { formationStep: true, licenseNumber: true },
  });
  if (!file || file.formationStep <= phase) return;
  if (file.licenseNumber && phase < ISSUANCE_FORMATION_STEP) return;
  await prisma.caseFile.update({
    where: { id: request.caseFileId },
    data: { formationStep: phase },
  });
}

export function inquiryRewindPhase(type: CaseRequestType) {
  if (type === CaseRequestType.ISSUANCE) return 3;
  if (type === CaseRequestType.RENEWAL || type === CaseRequestType.LOCATION_CHANGE) return 2;
  return null;
}

export function placesRewindPhase(type: CaseRequestType) {
  return type === CaseRequestType.ISSUANCE ? 4 : null;
}

export function managementRewindPhase(type: CaseRequestType) {
  if (type === CaseRequestType.ISSUANCE) return MANAGEMENT_FORMATION_STEP;
  if (type === CaseRequestType.RENEWAL || type === CaseRequestType.LOCATION_CHANGE) return 3;
  return null;
}

async function recordStatus(
  prisma: Db,
  requestId: string,
  fromStatus: CaseRequestStatus,
  toStatus: CaseRequestStatus,
  actorId?: string,
) {
  await prisma.caseRequestEvent.create({
    data: { requestId, fromStatus, toStatus, actorId: actorId ?? null },
  });
}

function isUniqueConflict(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

export async function openProcessRequest(
  prisma: PrismaService,
  caseFileId: string,
  type: ProcessType,
) {
  if (type === CaseRequestType.ISSUANCE) {
    throw new BadRequestException('درخواست صدور با تشکیل پرونده ساخته می‌شود');
  }
  const file = await prisma.caseFile.findUnique({
    where: { id: caseFileId },
    select: {
      id: true,
      licenseNumber: true,
      licenseIssuedAt: true,
      licenseExpiresAt: true,
    },
  });
  if (!file?.licenseNumber || !file.licenseIssuedAt || !file.licenseExpiresAt) {
    throw new BadRequestException('قبل از این درخواست باید مجوز صادر شده باشد');
  }
  const open = await findOpenRequest(prisma, file.id);
  if (open) throw new BadRequestException('یک درخواست باز روی این پرونده وجود دارد');

  for (let attempt = 0; attempt < 4; attempt++) {
    const number = await nextRequestNumber(prisma);
    try {
      return await prisma.$transaction(async (tx) => {
        const again = await findOpenRequest(tx, file.id);
        if (again) throw new BadRequestException('یک درخواست باز روی این پرونده وجود دارد');
        const request = await tx.caseRequest.create({
          data: {
            caseFileId: file.id,
            type,
            number,
            status: CaseRequestStatus.OPEN,
            formationStep: 0,
            ...(type === CaseRequestType.RENEWAL
              ? {
                  renewalTerms: {
                    create: renewalTermsFor(file.licenseIssuedAt!, file.licenseExpiresAt!),
                  },
                }
              : {}),
            ...(type === CaseRequestType.LOCATION_CHANGE ? { locationDraft: { create: {} } } : {}),
          },
          select: { id: true, number: true, type: true, formationStep: true, status: true },
        });
        await tx.caseRequestEvent.create({
          data: { requestId: request.id, toStatus: CaseRequestStatus.OPEN },
        });
        return request;
      });
    } catch (error) {
      if (!isUniqueConflict(error)) throw error;
    }
  }
  throw new ConflictException('صدور شماره درخواست انجام نشد');
}

async function assertDocuments(prisma: Db, requestId: string, requestType: CaseRequestType, jobId: string | null, gender: 'MALE' | 'FEMALE' | null) {
  const required = await resolveDocumentRequirements(prisma, requestType, jobId, gender);
  const stored = await prisma.caseActivityDocument.findMany({
    where: { caseRequestId: requestId },
    select: { documentId: true, versions: { select: { id: true }, take: 1 } },
  });
  const uploaded = new Set(stored.filter((row) => row.versions.length > 0).map((row) => row.documentId));
  if (required.some((item) => item.isRequired && !uploaded.has(item.id))) {
    throw new BadRequestException('مدارک الزامی این درخواست کامل نیست');
  }
}

async function assertInquiries(prisma: Db, requestId: string) {
  const pending = await prisma.caseInquiry.count({
    where: { caseRequestId: requestId, status: CaseInquiryStatus.PENDING },
  });
  if (pending > 0) throw new BadRequestException('استعلام‌های این درخواست هنوز باز است');
}

async function assertPlaces(prisma: Db, requestId: string) {
  const review = await prisma.casePlacesReview.findUnique({
    where: { caseRequestId: requestId },
    select: { status: true },
  });
  if (!review || review.status === CaseInquiryStatus.PENDING) {
    throw new BadRequestException('نظر اداره اماکن هنوز ثبت نشده است');
  }
}

async function assertManagement(prisma: Db, requestId: string) {
  const settings = await prisma.caseManagementApprover.count();
  if (settings === 0) return;
  const pending = await prisma.caseManagementReview.count({
    where: { caseRequestId: requestId, status: CaseInquiryStatus.PENDING },
  });
  const total = await prisma.caseManagementReview.count({ where: { caseRequestId: requestId } });
  if (total < settings || pending > 0) {
    throw new BadRequestException('تاییدهای مدیریتی این درخواست کامل نیست');
  }
}

export async function completeOpenRequest(prisma: PrismaService, caseFileId: string, actorId?: string) {
  return prisma.$transaction(async (tx) => {
    const request = await findOpenRequest(tx, caseFileId);
    if (!request || !isProcessType(request.type)) {
      throw new BadRequestException('درخواست بازی برای تکمیل نیست');
    }
    const file = await tx.caseFile.findUnique({
      where: { id: caseFileId },
      select: {
        id: true,
        createdAt: true,
        activityJobId: true,
        formationStep: true,
        licenseNumber: true,
        licenseIssuedAt: true,
        premiseCityId: true,
        premiseEstablishment: true,
        premiseComplexId: true,
        premiseAddress: true,
        premiseAddressEn: true,
        premisePlaque: true,
        premisePlaqueSeries: true,
        premiseFloor: true,
        premiseUnitNo: true,
        premisePostalCode: true,
        premisePhone: true,
        premiseFax: true,
        premiseGeoPosition: true,
        premisePublicAccess: true,
        registrationPlaceId: true,
        premiseOwnership: true,
        premiseDeedNo: true,
        premiseArea: true,
        leaseIssuedAt: true,
        leaseExpiresAt: true,
        leaseAgency: true,
        premiseOwnerName: true,
        user: { select: { gender: true } },
      },
    });
    if (!file) throw new BadRequestException('پرونده یافت نشد');
    const gender = file.user.gender;
    const completedAt = new Date();

    if (request.type === CaseRequestType.ISSUANCE) {
      if (file.formationStep < ISSUANCE_FORMATION_STEP) {
        throw new BadRequestException('مراحل صدور هنوز تمام نشده است');
      }
      await assertDocuments(tx, request.id, request.type, file.activityJobId, gender);
      await assertInquiries(tx, request.id);
      await assertPlaces(tx, request.id);
      await assertManagement(tx, request.id);
      if (!file.licenseNumber) {
        await assignLicenseNumber(tx, file.id, file.premiseOwnership, file.leaseExpiresAt);
      }
    }

    if (request.type === CaseRequestType.RENEWAL) {
      await assertDocuments(tx, request.id, request.type, file.activityJobId, gender);
      await assertInquiries(tx, request.id);
      await assertManagement(tx, request.id);
      const stored = await tx.caseRenewalTerms.findUnique({ where: { requestId: request.id } });
      if (!stored) throw new BadRequestException('تاریخ‌های تمدید مشخص نیست');
      const terms = await alignStoredRenewalTerms(tx, request.id, stored);
      await tx.caseFile.update({
        where: { id: file.id },
        data: { licenseIssuedAt: terms.nextIssuedAt, licenseExpiresAt: terms.nextExpiresAt },
      });
    }

    if (request.type === CaseRequestType.LOCATION_CHANGE) {
      await assertDocuments(tx, request.id, request.type, file.activityJobId, gender);
      await assertInquiries(tx, request.id);
      await assertManagement(tx, request.id);
      const draft = await tx.caseLocationDraft.findUnique({ where: { requestId: request.id } });
      if (!draft?.premiseCityId || !draft.premiseAddress || !draft.premiseOwnership) {
        throw new BadRequestException('اطلاعات محل جدید کامل نیست');
      }
      const previous = await tx.casePremiseHistory.findFirst({
        where: { caseFileId: file.id },
        orderBy: [{ endedAt: 'desc' }, { id: 'desc' }],
        select: { endedAt: true },
      });
      await tx.casePremiseHistory.create({
        data: {
          caseFileId: file.id,
          replacedByRequestId: request.id,
          startedAt: previous?.endedAt ?? file.licenseIssuedAt ?? file.createdAt,
          endedAt: completedAt,
          premiseCityId: file.premiseCityId,
          premiseEstablishment: file.premiseEstablishment,
          premiseComplexId: file.premiseComplexId,
          premiseAddress: file.premiseAddress,
          premiseAddressEn: file.premiseAddressEn,
          premisePlaque: file.premisePlaque,
          premisePlaqueSeries: file.premisePlaqueSeries,
          premiseFloor: file.premiseFloor,
          premiseUnitNo: file.premiseUnitNo,
          premisePostalCode: file.premisePostalCode,
          premisePhone: file.premisePhone,
          premiseFax: file.premiseFax,
          premiseGeoPosition: file.premiseGeoPosition,
          premisePublicAccess: file.premisePublicAccess,
          registrationPlaceId: file.registrationPlaceId,
          premiseOwnership: file.premiseOwnership,
          premiseDeedNo: file.premiseDeedNo,
          premiseArea: file.premiseArea,
          leaseIssuedAt: file.leaseIssuedAt,
          leaseExpiresAt: file.leaseExpiresAt,
          leaseAgency: file.leaseAgency,
          premiseOwnerName: file.premiseOwnerName,
        },
      });
      await tx.caseFile.update({
        where: { id: file.id },
        data: {
          premiseCityId: draft.premiseCityId,
          premiseEstablishment: draft.premiseEstablishment,
          premiseComplexId: draft.premiseComplexId,
          premiseAddress: draft.premiseAddress,
          premiseAddressEn: draft.premiseAddressEn,
          premisePlaque: draft.premisePlaque,
          premisePlaqueSeries: draft.premisePlaqueSeries,
          premiseFloor: draft.premiseFloor,
          premiseUnitNo: draft.premiseUnitNo,
          premisePostalCode: draft.premisePostalCode,
          premisePhone: draft.premisePhone,
          premiseFax: draft.premiseFax,
          premiseGeoPosition: draft.premiseGeoPosition,
          premisePublicAccess: draft.premisePublicAccess,
          registrationPlaceId: draft.registrationPlaceId,
          premiseOwnership: draft.premiseOwnership,
          premiseDeedNo: draft.premiseDeedNo,
          premiseArea: draft.premiseArea,
          leaseIssuedAt: draft.leaseIssuedAt,
          leaseExpiresAt: draft.leaseExpiresAt,
          leaseAgency: draft.leaseAgency,
          premiseOwnerName: draft.premiseOwnerName,
        },
      });
    }

    const closed = await tx.caseRequest.updateMany({
      where: { id: request.id, status: CaseRequestStatus.OPEN },
      data: { status: CaseRequestStatus.COMPLETED, completedAt },
    });
    if (closed.count !== 1) throw new ConflictException('درخواست قبلاً تکمیل شده است');
    await recordStatus(tx, request.id, CaseRequestStatus.OPEN, CaseRequestStatus.COMPLETED, actorId);
    return { id: request.id, type: request.type, status: CaseRequestStatus.COMPLETED };
  });
}
