import { Injectable } from '@nestjs/common';
import { toLatinDigits } from '../common/national-id';
import {
  containsInsensitive,
  normalizeSearchDigits,
  paginatedResult,
  paginationArgs,
} from '../common/pagination';
import {
  CaseFileKind,
  CaseFileStatus,
  CaseRequestStatus,
  CaseRequestType,
  Prisma,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CaseKindFilter } from './dto/find-cases-query.dto';
import { FindExpiringCasesQueryDto } from './dto/find-expiring-cases-query.dto';
import { daysUntil, expiringWindow, type ExpiringRange } from './expiring-range';

function dateOnly(value: Date | null) {
  return value ? value.toISOString().slice(0, 10) : null;
}

function caseKindWhere(caseKind?: CaseKindFilter): Prisma.CaseFileWhereInput {
  if (caseKind === 'STEWARD_REQUEST') {
    return {
      kind: CaseFileKind.LICENSE,
      stewardCases: { some: {} },
    };
  }
  if (caseKind === 'STEWARD_CARD') {
    return {
      requests: {
        some: {
          type: CaseRequestType.STEWARDSHIP,
          status: { in: [CaseRequestStatus.ISSUED, CaseRequestStatus.COMPLETED] },
        },
      },
    };
  }
  if (
    caseKind === 'ISSUANCE' ||
    caseKind === 'RENEWAL' ||
    caseKind === 'LOCATION_CHANGE' ||
    caseKind === 'AUCTION'
  ) {
    return { requests: { some: { type: caseKind } } };
  }
  return {};
}

const expiringSelect = {
  id: true,
  kind: true,
  status: true,
  licenseNumber: true,
  licenseExpiresAt: true,
  cardNumber: true,
  cardExpiresAt: true,
  businessUnitTitle: true,
  activityJob: { select: { id: true, title: true } },
  hostCaseFile: {
    select: {
      businessUnitTitle: true,
      activityJob: { select: { id: true, title: true } },
    },
  },
  user: { select: { fullName: true, nationalId: true } },
} satisfies Prisma.CaseFileSelect;

type ExpiringRow = Prisma.CaseFileGetPayload<{ select: typeof expiringSelect }>;

function displayOf(row: ExpiringRow) {
  const steward = row.kind === CaseFileKind.STEWARDSHIP;
  const job = steward ? row.hostCaseFile?.activityJob ?? null : row.activityJob;
  const expiresAt = steward ? row.cardExpiresAt : row.licenseExpiresAt;
  return {
    licenseNumber: steward ? row.cardNumber : row.licenseNumber,
    fullName: row.user.fullName,
    nationalId: row.user.nationalId,
    jobTitle: job?.title ?? null,
    unitTitle: steward ? row.hostCaseFile?.businessUnitTitle ?? null : row.businessUnitTitle,
    expiresAt,
    job,
  };
}

function compareText(left: string | null, right: string | null) {
  return (left ?? '').localeCompare(right ?? '', 'fa');
}

@Injectable()
export class ExpiringCasesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: FindExpiringCasesQueryDto) {
    const range: ExpiringRange = query.range ?? 'this-week';
    const { start, end, today } = expiringWindow(range);
    const expired = range === 'expired';
    const expiresWithin = start ? { gte: start, lte: end } : { lte: end };
    const q = query.q?.trim();
    const digits = q ? normalizeSearchDigits(q) : '';
    const licenseQuery = q ? toLatinDigits(q).trim() : '';
    const where: Prisma.CaseFileWhereInput = {
      AND: [
        expired
          ? {
              status: CaseFileStatus.EXPIRED,
              OR: [
                { kind: CaseFileKind.LICENSE, licenseNumber: { not: null } },
                { kind: CaseFileKind.STEWARDSHIP, cardNumber: { not: null } },
              ],
            }
          : {
              OR: [
                {
                  kind: CaseFileKind.LICENSE,
                  licenseNumber: { not: null },
                  licenseExpiresAt: expiresWithin,
                },
                {
                  kind: CaseFileKind.STEWARDSHIP,
                  cardNumber: { not: null },
                  cardExpiresAt: expiresWithin,
                },
              ],
            },
        expired
          ? query.status
            ? { status: query.status }
            : {}
          : { status: query.status ?? { not: CaseFileStatus.REVOKED } },
        query.jobId
          ? {
              OR: [
                { activityJobId: query.jobId },
                { hostCaseFile: { activityJobId: query.jobId } },
              ],
            }
          : query.jobGroupId
            ? {
                OR: [
                  { activityJob: { groupId: query.jobGroupId } },
                  { hostCaseFile: { activityJob: { groupId: query.jobGroupId } } },
                ],
              }
            : {},
        caseKindWhere(query.caseKind),
        q
          ? {
              OR: [
                { user: { firstName: containsInsensitive(q) } },
                { user: { lastName: containsInsensitive(q) } },
                { user: { fullName: containsInsensitive(q) } },
                { businessUnitTitle: containsInsensitive(q) },
                { hostCaseFile: { businessUnitTitle: containsInsensitive(q) } },
                ...(licenseQuery
                  ? [
                      { licenseNumber: containsInsensitive(licenseQuery) },
                      { cardNumber: containsInsensitive(licenseQuery) },
                    ]
                  : []),
                ...(digits
                  ? [
                      { user: { nationalId: { contains: digits } } },
                      { user: { phone: { contains: digits } } },
                    ]
                  : []),
              ],
            }
          : {},
      ],
    };

    const rows = await this.prisma.caseFile.findMany({ where, select: expiringSelect });
    const sortBy = query.sortBy ?? 'daysRemaining';
    const dir = query.sortDir
      ? query.sortDir === 'desc'
        ? -1
        : 1
      : !query.sortBy && range === 'expired'
        ? -1
        : 1;
    rows.sort((left, right) => {
      const a = displayOf(left);
      const b = displayOf(right);
      let result = 0;
      if (sortBy === 'licenseNumber') result = compareText(a.licenseNumber, b.licenseNumber);
      else if (sortBy === 'fullName') result = compareText(a.fullName, b.fullName);
      else if (sortBy === 'nationalId') result = compareText(a.nationalId, b.nationalId);
      else if (sortBy === 'job') result = compareText(a.jobTitle, b.jobTitle);
      else if (sortBy === 'jobTitle') result = compareText(a.unitTitle, b.unitTitle);
      else {
        const aTime = a.expiresAt?.getTime() ?? Number.POSITIVE_INFINITY;
        const bTime = b.expiresAt?.getTime() ?? Number.POSITIVE_INFINITY;
        result = aTime - bTime;
      }
      if (result !== 0) return result * dir;
      return left.id.localeCompare(right.id);
    });

    const { page, pageSize, skip, take } = paginationArgs(query);
    const pageRows = rows.slice(skip, skip + take);
    const items = pageRows.map((row) => {
      const view = displayOf(row);
      return {
        id: row.id,
        kind: row.kind,
        status: row.status,
        licenseNumber: view.licenseNumber,
        fullName: view.fullName,
        nationalId: view.nationalId,
        job: view.job,
        jobTitle: view.unitTitle,
        expiresAt: dateOnly(view.expiresAt),
        daysRemaining: view.expiresAt ? daysUntil(view.expiresAt, today) : 0,
      };
    });
    return paginatedResult(items, rows.length, page, pageSize);
  }
}
