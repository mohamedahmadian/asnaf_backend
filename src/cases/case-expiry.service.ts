import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { normalizeNationalId } from '../common/national-id';
import { paginatedResult, paginationArgs } from '../common/pagination';
import { CaseFileKind, Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FindCaseExpiryQueryDto } from './dto/find-case-expiry-query.dto';
import { syncCaseStatus } from './case-status';

function dateOnly(value: Date | null) {
  return value ? value.toISOString().slice(0, 10) : null;
}

function parseDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

const issuedCaseWhere: Prisma.CaseFileWhereInput = {
  OR: [
    { kind: CaseFileKind.LICENSE, licenseNumber: { not: null } },
    { kind: CaseFileKind.STEWARDSHIP, cardNumber: { not: null } },
  ],
};

const caseExpirySelect = {
  id: true,
  kind: true,
  status: true,
  licenseNumber: true,
  licenseIssuedAt: true,
  licenseExpiresAt: true,
  cardNumber: true,
  cardIssuedAt: true,
  cardExpiresAt: true,
  businessUnitTitle: true,
  createdAt: true,
  activityJob: { select: { id: true, title: true } },
  hostCaseFile: {
    select: {
      businessUnitTitle: true,
      activityJob: { select: { id: true, title: true } },
    },
  },
  user: { select: { fullName: true, nationalId: true } },
} satisfies Prisma.CaseFileSelect;

type CaseExpiryRow = Prisma.CaseFileGetPayload<{ select: typeof caseExpirySelect }>;

function viewOf(row: CaseExpiryRow) {
  const steward = row.kind === CaseFileKind.STEWARDSHIP;
  const job = steward ? row.hostCaseFile?.activityJob ?? null : row.activityJob;
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    licenseNumber: steward ? row.cardNumber : row.licenseNumber,
    fullName: row.user.fullName,
    nationalId: row.user.nationalId,
    job,
    jobTitle: steward ? row.hostCaseFile?.businessUnitTitle ?? null : row.businessUnitTitle,
    issuedAt: dateOnly(steward ? row.cardIssuedAt : row.licenseIssuedAt),
    expiresAt: dateOnly(steward ? row.cardExpiresAt : row.licenseExpiresAt),
  };
}

type CaseExpiryView = ReturnType<typeof viewOf>;

function compareText(left: string | null, right: string | null) {
  return (left ?? '').localeCompare(right ?? '', 'fa');
}

function compareBy(sortBy: string | undefined, a: CaseExpiryView, b: CaseExpiryView) {
  if (sortBy === 'fullName') return compareText(a.fullName, b.fullName);
  if (sortBy === 'licenseNumber') return compareText(a.licenseNumber, b.licenseNumber);
  if (sortBy === 'kind') return compareText(a.kind, b.kind);
  if (sortBy === 'status') return compareText(a.status, b.status);
  if (sortBy === 'job') return compareText(a.job?.title ?? null, b.job?.title ?? null);
  if (sortBy === 'jobTitle') return compareText(a.jobTitle, b.jobTitle);
  if (sortBy === 'issuedAt') return compareText(a.issuedAt, b.issuedAt);
  if (sortBy === 'expiresAt') return compareText(a.expiresAt, b.expiresAt);
  return 0;
}

@Injectable()
export class CaseExpiryService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: FindCaseExpiryQueryDto) {
    const { page, pageSize, skip, take } = paginationArgs(query);
    const nationalId = query.q ? normalizeNationalId(query.q) : '';
    if (!nationalId) return paginatedResult([], 0, page, pageSize);

    const rows = await this.prisma.caseFile.findMany({
      where: { AND: [issuedCaseWhere, { user: { nationalId } }] },
      select: caseExpirySelect,
    });
    const dir = query.sortDir === 'desc' ? -1 : 1;
    const sorted = rows
      .map((row) => ({ row, view: viewOf(row) }))
      .sort((left, right) => {
        const result = query.sortDir ? compareBy(query.sortBy, left.view, right.view) * dir : 0;
        if (result !== 0) return result;
        const created = right.row.createdAt.getTime() - left.row.createdAt.getTime();
        return created !== 0 ? created : left.row.id.localeCompare(right.row.id);
      });
    const items = sorted.slice(skip, skip + take).map((item) => item.view);
    return paginatedResult(items, sorted.length, page, pageSize);
  }

  async findOne(id: string) {
    return viewOf(await this.findIssued(id));
  }

  async update(id: string, expiresAt: string) {
    const row = await this.findIssued(id);
    const steward = row.kind === CaseFileKind.STEWARDSHIP;
    const issuedAt = steward ? row.cardIssuedAt : row.licenseIssuedAt;
    const expires = parseDate(expiresAt);
    if (Number.isNaN(expires.getTime())) {
      throw new BadRequestException('تاریخ انقضا معتبر نیست');
    }
    if (issuedAt && expires.getTime() <= issuedAt.getTime()) {
      throw new BadRequestException('تاریخ انقضا باید بعد از تاریخ صدور باشد');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.caseFile.update({
        where: { id },
        data: steward ? { cardExpiresAt: expires } : { licenseExpiresAt: expires },
      });
      await syncCaseStatus(tx, id);
    });
    return this.findOne(id);
  }

  private async findIssued(id: string) {
    const row = await this.prisma.caseFile.findFirst({
      where: { AND: [{ id }, issuedCaseWhere] },
      select: caseExpirySelect,
    });
    if (!row) throw new NotFoundException('پرونده‌ای با مجوز صادرشده یافت نشد');
    return row;
  }
}
