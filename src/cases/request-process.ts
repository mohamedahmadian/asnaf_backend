import { BadRequestException, ConflictException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { PERSONNEL_PHOTO_CODE } from './personnel-photo';
import {
  CaseInquiryStatus,
  CaseFileStatus,
  CaseRequestStatus,
  CaseRequestType,
  DocumentGender,
  Prisma,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CONTRACT_DURATION_MAX, CONTRACT_DURATION_MIN, clampContractYears, readContractYears } from './contract-duration';
import {
  ISSUANCE_FORMATION_STEP,
  MANAGEMENT_FORMATION_STEP,
  STEWARDSHIP_ISSUANCE_STEP,
  STEWARDSHIP_MANAGEMENT_STEP,
  assignLicenseNumber,
  nextRequestNumber,
} from './formation-steps';

export type Db = PrismaService | Prisma.TransactionClient;

const PROCESS_TYPES = [
  CaseRequestType.ISSUANCE,
  CaseRequestType.RENEWAL,
  CaseRequestType.LOCATION_CHANGE,
] as const;

const SETTINGS_REQUEST_TYPES = [
  CaseRequestType.ISSUANCE,
  CaseRequestType.RENEWAL,
  CaseRequestType.LOCATION_CHANGE,
  CaseRequestType.AUCTION,
  CaseRequestType.STEWARDSHIP,
] as const;

export type ProcessType = (typeof PROCESS_TYPES)[number];
export type SettingsRequestType = (typeof SETTINGS_REQUEST_TYPES)[number];

export function isProcessType(value: string): value is ProcessType {
  return (PROCESS_TYPES as readonly string[]).includes(value);
}

export function isSettingsRequestType(value: string): value is SettingsRequestType {
  return (SETTINGS_REQUEST_TYPES as readonly string[]).includes(value);
}

export async function processManagementTitles(prisma: Db, requestType: string) {
  if (!isSettingsRequestType(requestType)) return [];
  return prisma.caseProcessManagementRole.findMany({
    where: { requestType },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { roleId: true, title: true, role: { select: { code: true, name: true } } },
  });
}

export function requestIsOpen(status: CaseRequestStatus) {
  return status === CaseRequestStatus.OPEN;
}

export function requestIsDone(status: CaseRequestStatus) {
  return status === CaseRequestStatus.ISSUED || status === CaseRequestStatus.COMPLETED;
}

/** درخواست باز آزاد است. درخواست تمام‌شده فقط با تنظیم ویرایش بعد از صدور و نقش انتخاب‌شده عوض می‌شود. */
export async function assertRequestMutable(prisma: Db, caseRequestId: string, actorId?: string) {
  const request = await prisma.caseRequest.findUnique({
    where: { id: caseRequestId },
    select: { status: true },
  });
  if (!request) throw new NotFoundException('درخواست یافت نشد');
  if (requestIsOpen(request.status)) return;
  if (!requestIsDone(request.status)) {
    throw new BadRequestException('این درخواست قابل ویرایش نیست');
  }
  if (!actorId) throw new UnauthorizedException();
  const settings = await prisma.caseGeneralSettings.findUnique({
    where: { id: 'default' },
    select: { editAfterIssuance: true, editorRoleId: true },
  });
  if (!settings?.editAfterIssuance || !settings.editorRoleId) {
    throw new BadRequestException('مجوز فعالیت اقتصادی این پرونده صادر شده است');
  }
  const match = await prisma.userRole.findUnique({
    where: { userId_roleId: { userId: actorId, roleId: settings.editorRoleId } },
    select: { userId: true },
  });
  if (!match) {
    throw new BadRequestException('ویرایش پرونده صادرشده فقط برای نقش تعیین‌شده مجاز است');
  }
}

export async function findOpenRequest(prisma: Db, caseFileId: string) {
  return prisma.caseRequest.findFirst({
    where: { caseFileId, status: CaseRequestStatus.OPEN },
  });
}

/** ردیف‌های یک درخواست. بدون شناسه، درخواست صدور همین پرونده است، نه درخواست باز. */
export async function requestOnCase(prisma: Db, caseFileId: string, requestId?: string) {
  if (requestId) {
    const request = await prisma.caseRequest.findFirst({
      where: { id: requestId, caseFileId },
    });
    if (!request) throw new NotFoundException('درخواست یافت نشد');
    return request;
  }
  if (!caseFileId) return null;
  return prisma.caseRequest.findFirst({
    where: { caseFileId, type: CaseRequestType.ISSUANCE },
    orderBy: { createdAt: 'desc' },
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
    if (row.document.code === PERSONNEL_PHOTO_CODE) continue;
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

/** بازهٔ تمدید از تاریخ انقضای فعلی پرونده به اندازهٔ مدت قرارداد؛ اجاره در آن دخیل نیست. */
export function renewalWindow(currentExpiresAt: Date, years = 1) {
  const currentExpiry = utcDateOnly(currentExpiresAt);
  return {
    nextIssuedAt: currentExpiry,
    nextExpiresAt: addUtcYears(currentExpiry, clampContractYears(years)),
  };
}

function wholeYearSpan(start: Date, end: Date) {
  for (let years = CONTRACT_DURATION_MIN; years <= CONTRACT_DURATION_MAX; years++) {
    if (addUtcYears(start, years).getTime() === end.getTime()) return years;
  }
  return null;
}

/** اگر انقضا هنوز همان بازهٔ سالانهٔ پیش‌فرض است، آن را با مدت قرارداد فعلی هم‌گام می‌کند. */
export async function alignDefaultRenewalExpiry<
  T extends { requestId: string; nextIssuedAt: Date; nextExpiresAt: Date },
>(prisma: Db, terms: T, years: number) {
  const issued = utcDateOnly(terms.nextIssuedAt);
  const expires = utcDateOnly(terms.nextExpiresAt);
  const target = clampContractYears(years);
  const span = wholeYearSpan(issued, expires);
  if (span == null || span === target) return terms;
  const nextExpiresAt = addUtcYears(issued, target);
  await prisma.caseRenewalTerms.update({
    where: { requestId: terms.requestId },
    data: { nextExpiresAt },
  });
  return { ...terms, nextExpiresAt };
}

export function renewalTermsFor(
  currentIssuedAt: Date,
  currentExpiresAt: Date,
  today = new Date(),
  years = 1,
) {
  const opened = utcDateOnly(today);
  const currentExpiry = utcDateOnly(currentExpiresAt);
  const delayDays = Math.floor((opened.getTime() - currentExpiry.getTime()) / 86_400_000);
  return {
    currentIssuedAt: utcDateOnly(currentIssuedAt),
    currentExpiresAt: currentExpiry,
    ...renewalWindow(currentExpiry, years),
    delayDays: delayDays > 0 ? delayDays : 0,
  };
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
  if (request.type === CaseRequestType.STEWARDSHIP) {
    const file = await prisma.caseFile.findUnique({
      where: { id: request.caseFileId },
      select: { formationStep: true, cardNumber: true },
    });
    if (!file || file.cardNumber || file.formationStep <= phase) return;
    await prisma.caseFile.update({
      where: { id: request.caseFileId },
      data: { formationStep: phase },
    });
    return;
  }
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
  if (type === CaseRequestType.STEWARDSHIP) return 1;
  return null;
}

export function placesRewindPhase(type: CaseRequestType) {
  if (type === CaseRequestType.ISSUANCE) return 4;
  if (type === CaseRequestType.RENEWAL || type === CaseRequestType.LOCATION_CHANGE) return 3;
  if (type === CaseRequestType.STEWARDSHIP) return 2;
  return null;
}

export function managementRewindPhase(type: CaseRequestType) {
  if (type === CaseRequestType.ISSUANCE) return MANAGEMENT_FORMATION_STEP;
  if (type === CaseRequestType.RENEWAL || type === CaseRequestType.LOCATION_CHANGE) return 4;
  if (type === CaseRequestType.AUCTION) return 1;
  if (type === CaseRequestType.STEWARDSHIP) return STEWARDSHIP_MANAGEMENT_STEP;
  return null;
}

/** درخواست به مرحلهٔ تایید مدیریتی رسیده است. */
export function managementReachedWhere(): Prisma.CaseRequestWhereInput {
  return {
    OR: [
      { type: CaseRequestType.ISSUANCE, formationStep: { gte: MANAGEMENT_FORMATION_STEP } },
      { type: CaseRequestType.RENEWAL, formationStep: { gte: 4 } },
      { type: CaseRequestType.LOCATION_CHANGE, formationStep: { gte: 4 } },
      { type: CaseRequestType.AUCTION, formationStep: { gte: 1 } },
      { type: CaseRequestType.STEWARDSHIP, formationStep: { gte: STEWARDSHIP_MANAGEMENT_STEP } },
    ],
  };
}

/** درخواست به مرحلهٔ صدور رسیده و هنوز باز است. */
export function issuanceReachedWhere(): Prisma.CaseRequestWhereInput {
  return {
    OR: [
      { type: CaseRequestType.ISSUANCE, formationStep: { gte: ISSUANCE_FORMATION_STEP } },
      { type: CaseRequestType.RENEWAL, formationStep: { gte: 5 } },
      { type: CaseRequestType.LOCATION_CHANGE, formationStep: { gte: 5 } },
      { type: CaseRequestType.AUCTION, formationStep: { gte: 2 } },
      { type: CaseRequestType.STEWARDSHIP, formationStep: { gte: STEWARDSHIP_ISSUANCE_STEP } },
    ],
  };
}

export async function recordStatus(
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
      status: true,
      licenseNumber: true,
      licenseIssuedAt: true,
      licenseExpiresAt: true,
    },
  });
  if (file?.status === CaseFileStatus.REVOKED) {
    throw new BadRequestException('روی پرونده ابطال‌شده درخواست جدید ثبت نمی‌شود');
  }
  if (!file?.licenseNumber || !file.licenseIssuedAt || !file.licenseExpiresAt) {
    throw new BadRequestException('قبل از این درخواست باید مجوز صادر شده باشد');
  }
  const open = await findOpenRequest(prisma, file.id);
  if (open) throw new BadRequestException('یک درخواست باز روی این پرونده وجود دارد');

  const contractYears = await readContractYears(prisma);
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
                    create: renewalTermsFor(file.licenseIssuedAt!, file.licenseExpiresAt!, new Date(), contractYears),
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
  const request = await prisma.caseRequest.findUnique({
    where: { id: requestId },
    select: { type: true },
  });
  const configured = request ? await processManagementTitles(prisma, request.type) : [];
  if (!configured.length) return;
  const roleIds = configured.map((item) => item.roleId);
  const [pending, total] = await Promise.all([
    prisma.caseManagementReview.count({
      where: { caseRequestId: requestId, roleId: { in: roleIds }, status: CaseInquiryStatus.PENDING },
    }),
    prisma.caseManagementReview.count({
      where: { caseRequestId: requestId, roleId: { in: roleIds } },
    }),
  ]);
  if (total < configured.length || pending > 0) {
    throw new BadRequestException('تاییدهای مدیریتی این درخواست کامل نیست');
  }
}

export async function completeOpenRequest(
  prisma: PrismaService,
  caseFileId: string,
  actorId?: string,
  licenseDates?: { issuedAt?: Date | null; expiresAt?: Date | null },
) {
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
        const issuedAt = licenseDates?.issuedAt ?? null;
        const expiresAt = licenseDates?.expiresAt ?? null;
        if ((issuedAt && !expiresAt) || (!issuedAt && expiresAt)) {
          throw new BadRequestException('تاریخ صدور و تاریخ انقضا را با هم وارد کنید');
        }
        const years = await readContractYears(tx);
        await assignLicenseNumber(tx, file.id, issuedAt, expiresAt, years);
      }
    }

    if (request.type === CaseRequestType.RENEWAL) {
      await assertDocuments(tx, request.id, request.type, file.activityJobId, gender);
      await assertInquiries(tx, request.id);
      await assertPlaces(tx, request.id);
      await assertManagement(tx, request.id);
      const stored = await tx.caseRenewalTerms.findUnique({ where: { requestId: request.id } });
      if (!stored) throw new BadRequestException('تاریخ‌های تمدید مشخص نیست');
      if (stored.nextExpiresAt.getTime() <= stored.nextIssuedAt.getTime()) {
        throw new BadRequestException('تاریخ انقضا باید بعد از تاریخ صدور باشد');
      }
      await tx.caseFile.update({
        where: { id: file.id },
        data: { licenseIssuedAt: stored.nextIssuedAt, licenseExpiresAt: stored.nextExpiresAt },
      });
    }

    if (request.type === CaseRequestType.LOCATION_CHANGE) {
      await assertDocuments(tx, request.id, request.type, file.activityJobId, gender);
      await assertInquiries(tx, request.id);
      await assertPlaces(tx, request.id);
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
