import { CaseRequestStatus, CaseRequestType, MunicipalFeeCalcKind, Prisma, PrismaClient } from '../generated/prisma/client';

export const municipalFeeCalcKinds = [
  MunicipalFeeCalcKind.FIXED,
  MunicipalFeeCalcKind.ANNUAL_MEMBERSHIP,
  MunicipalFeeCalcKind.AREA_LEVY,
  MunicipalFeeCalcKind.LATE_MEMBERSHIP,
  MunicipalFeeCalcKind.LATE_AREA_LEVY,
] as const;

export type FeeCalcInputs = {
  area: number | null;
  membershipFee: number | null;
  areaTariff: number | null;
  delayDays: number;
  yearNumber: number;
  factor: number;
  jobTypeTitle: string | null;
  jobTypeAnnualFee: number | null;
  jobTitle: string | null;
  jobAnnualFee: number | null;
};

export type FeeCalcContext = {
  requestType: CaseRequestType;
  area: number | null;
  membershipFee: number | null;
  areaTariff: number | null;
  delayDays: number;
  yearNumber: number;
  jobTypeTitle: string | null;
  jobTypeAnnualFee: number | null;
  jobTitle: string | null;
  jobAnnualFee: number | null;
};

export type FeeCalcResult = {
  amount: number;
  calcKind: MunicipalFeeCalcKind;
  inputs: FeeCalcInputs;
};

type DecimalLike = Prisma.Decimal | number | null | undefined;

export function toFeeNumber(value: DecimalLike) {
  if (value == null) return null;
  return typeof value === 'number' ? value : Number(value);
}

export function dailyRate(annual: number | null | undefined) {
  if (annual == null || !Number.isFinite(annual)) return null;
  return Math.round(annual / 365);
}

export function areaLevyFactor(yearNumber: number) {
  return yearNumber % 4 === 1 ? 1 : 0.5;
}

export function yearNumberForRequest(requestType: CaseRequestType, completedRenewalCount: number) {
  if (requestType === CaseRequestType.RENEWAL) return completedRenewalCount + 2;
  return 1;
}

export function computeFeeAmount(
  kind: MunicipalFeeCalcKind,
  catalogAmount: number,
  ctx: FeeCalcContext,
): FeeCalcResult {
  const factor = ctx.requestType === CaseRequestType.RENEWAL ? areaLevyFactor(ctx.yearNumber) : 1;
  const inputs: FeeCalcInputs = {
    area: ctx.area,
    membershipFee: ctx.membershipFee,
    areaTariff: ctx.areaTariff,
    delayDays: ctx.delayDays,
    yearNumber: ctx.yearNumber,
    factor,
    jobTypeTitle: ctx.jobTypeTitle,
    jobTypeAnnualFee: ctx.jobTypeAnnualFee,
    jobTitle: ctx.jobTitle,
    jobAnnualFee: ctx.jobAnnualFee,
  };

  switch (kind) {
    case MunicipalFeeCalcKind.FIXED:
      return { amount: Math.max(0, Math.round(catalogAmount)), calcKind: kind, inputs };
    case MunicipalFeeCalcKind.ANNUAL_MEMBERSHIP:
      return { amount: Math.max(0, Math.round(ctx.membershipFee ?? 0)), calcKind: kind, inputs };
    case MunicipalFeeCalcKind.AREA_LEVY: {
      const area = ctx.area ?? 0;
      const tariff = ctx.areaTariff ?? 0;
      return { amount: Math.max(0, Math.round(area * tariff * factor)), calcKind: kind, inputs };
    }
    case MunicipalFeeCalcKind.LATE_MEMBERSHIP: {
      const daily = dailyRate(ctx.membershipFee) ?? 0;
      return { amount: Math.max(0, ctx.delayDays * daily), calcKind: kind, inputs };
    }
    case MunicipalFeeCalcKind.LATE_AREA_LEVY: {
      const daily = dailyRate(ctx.areaTariff) ?? 0;
      const area = ctx.area ?? 0;
      return { amount: Math.max(0, Math.round(ctx.delayDays * area * daily)), calcKind: kind, inputs };
    }
  }
}

function textOrNull(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : null;
}

export function mapCalcInputs(value: Prisma.JsonValue | null | undefined): FeeCalcInputs | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  return {
    area: toFeeNumber(typeof row.area === 'number' ? row.area : null),
    membershipFee: toFeeNumber(typeof row.membershipFee === 'number' ? row.membershipFee : null),
    areaTariff: toFeeNumber(typeof row.areaTariff === 'number' ? row.areaTariff : null),
    delayDays: typeof row.delayDays === 'number' ? row.delayDays : 0,
    yearNumber: typeof row.yearNumber === 'number' ? row.yearNumber : 1,
    factor: typeof row.factor === 'number' ? row.factor : 1,
    jobTypeTitle: textOrNull(row.jobTypeTitle),
    jobTypeAnnualFee: toFeeNumber(typeof row.jobTypeAnnualFee === 'number' ? row.jobTypeAnnualFee : null),
    jobTitle: textOrNull(row.jobTitle),
    jobAnnualFee: toFeeNumber(typeof row.jobAnnualFee === 'number' ? row.jobAnnualFee : null),
  };
}

export function enrichCalcInputs(inputs: FeeCalcInputs | null, ctx: FeeCalcContext): FeeCalcInputs {
  const factor = ctx.requestType === CaseRequestType.RENEWAL ? areaLevyFactor(ctx.yearNumber) : 1;
  return {
    area: inputs?.area ?? ctx.area,
    membershipFee: inputs?.membershipFee ?? ctx.membershipFee,
    areaTariff: inputs?.areaTariff ?? ctx.areaTariff,
    delayDays: inputs?.delayDays ?? ctx.delayDays,
    yearNumber: inputs?.yearNumber ?? ctx.yearNumber,
    factor: inputs?.factor ?? factor,
    jobTypeTitle: inputs?.jobTypeTitle ?? ctx.jobTypeTitle,
    jobTypeAnnualFee: inputs?.jobTypeAnnualFee ?? ctx.jobTypeAnnualFee,
    jobTitle: inputs?.jobTitle ?? ctx.jobTitle,
    jobAnnualFee: inputs?.jobAnnualFee ?? ctx.jobAnnualFee,
  };
}

export async function loadFeeCalcContext(
  prisma: Pick<PrismaClient, 'caseRequest'>,
  requestId: string,
): Promise<FeeCalcContext> {
  const request = await prisma.caseRequest.findUnique({
    where: { id: requestId },
    select: {
      type: true,
      caseFile: {
        select: {
          id: true,
          premiseArea: true,
          activityJob: {
            select: {
              title: true,
              annualFee: true,
              jobType: { select: { title: true, annualFee: true, annualAreaTariff: true } },
            },
          },
        },
      },
      renewalTerms: { select: { delayDays: true } },
    },
  });
  if (!request) {
    return {
      requestType: CaseRequestType.ISSUANCE,
      area: null,
      membershipFee: null,
      areaTariff: null,
      delayDays: 0,
      yearNumber: 1,
      jobTypeTitle: null,
      jobTypeAnnualFee: null,
      jobTitle: null,
      jobAnnualFee: null,
    };
  }

  const completedRenewals = await prisma.caseRequest.count({
    where: {
      caseFileId: request.caseFile.id,
      type: CaseRequestType.RENEWAL,
      status: { in: [CaseRequestStatus.COMPLETED, CaseRequestStatus.ISSUED] },
      id: { not: requestId },
    },
  });

  const job = request.caseFile.activityJob;
  return {
    requestType: request.type,
    area: toFeeNumber(request.caseFile.premiseArea),
    membershipFee: toFeeNumber(job?.annualFee ?? job?.jobType.annualFee ?? null),
    areaTariff: toFeeNumber(job?.jobType.annualAreaTariff ?? null),
    delayDays: request.renewalTerms?.delayDays ?? 0,
    yearNumber: yearNumberForRequest(request.type, completedRenewals),
    jobTypeTitle: job?.jobType.title ?? null,
    jobTypeAnnualFee: toFeeNumber(job?.jobType.annualFee ?? null),
    jobTitle: job?.title ?? null,
    jobAnnualFee: toFeeNumber(job?.annualFee ?? null),
  };
}
