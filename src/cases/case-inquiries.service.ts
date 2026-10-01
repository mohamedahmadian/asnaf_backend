import { randomUUID } from 'crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  containsInsensitive,
  normalizeSearchDigits,
  paginatedResult,
  paginationArgs,
  wantsPagination,
} from '../common/pagination';
import { resolveSortOrder } from '../common/sort-query';
import {
  CaseInquiryChannel,
  CaseInquiryStatus,
  Prisma,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FindCaseInquiriesQueryDto } from './dto/find-case-inquiries-query.dto';
import { PersonFileStorage } from './person-file.storage';

const inquiryInclude = {
  inquiryCenter: {
    select: {
      id: true,
      name: true,
      phone: true,
      officerId: true,
      officer: { select: { fullName: true } },
    },
  },
  decidedBy: { select: { id: true, fullName: true } },
  files: {
    orderBy: { createdAt: 'desc' as const },
    select: {
      id: true,
      originalName: true,
      mimeType: true,
      byteSize: true,
      createdAt: true,
    },
  },
} satisfies Prisma.CaseInquiryInclude;

type InquiryRecord = Prisma.CaseInquiryGetPayload<{ include: typeof inquiryInclude }>;

const DEFAULT_LETTER_BODY = [
  'با سلام',
  'خواهشمند است نسبت به استعلام {{fullName}} به شماره ملی {{nationalId}} با کد پیگیری {{trackingCode}} برای شغل {{jobTitle}} ({{unitTitle}}) اعلام نظر فرمایید.',
  'نشانی: {{address}}',
  'تلفن: {{phone}}',
].join('\n');

export type InquiryActor = {
  id: string;
  isAdmin?: boolean;
  formation?: boolean;
};

function mapInquiry(row: InquiryRecord) {
  return {
    id: row.id,
    status: row.status,
    channel: row.channel,
    note: row.note,
    decidedAt: row.decidedAt,
    decidedBy: row.decidedBy,
    center: {
      id: row.inquiryCenter.id,
      name: row.inquiryCenter.name,
      phone: row.inquiryCenter.phone,
      officerName: row.inquiryCenter.officer?.fullName ?? null,
    },
    files: row.files,
  };
}

@Injectable()
export class CaseInquiriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly files: PersonFileStorage,
  ) {}

  async ensureForUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, activityJobId: true },
    });
    if (!user?.activityJobId) return;
    const links = await this.prisma.jobInquiryCenter.findMany({
      where: { jobId: user.activityJobId, inquiryCenter: { isActive: true } },
      select: { inquiryCenterId: true },
    });
    if (!links.length) return;
    await this.prisma.caseInquiry.createMany({
      data: links.map((link) => ({
        userId: user.id,
        inquiryCenterId: link.inquiryCenterId,
      })),
      skipDuplicates: true,
    });
  }

  async assertDelivered(userId: string) {
    await this.ensureForUser(userId);
    const pending = await this.prisma.caseInquiry.count({
      where: { userId, status: CaseInquiryStatus.PENDING },
    });
    if (pending > 0) {
      throw new BadRequestException('قبل از مرحله اماکن باید نتیجه همه استعلام‌ها ثبت شود');
    }
  }

  async listForCase(userId: string) {
    await this.ensureForUser(userId);
    const rows = await this.prisma.caseInquiry.findMany({
      where: { userId },
      include: inquiryInclude,
      orderBy: [{ inquiryCenter: { name: 'asc' } }, { id: 'asc' }],
    });
    return rows.map(mapInquiry);
  }

  async letter(id: string, actor: InquiryActor) {
    const row = await this.findReadable(id, actor);
    const person = await this.prisma.user.findUnique({
      where: { id: row.userId },
      select: {
        fullName: true,
        nationalId: true,
        caseTrackingCode: true,
        phone: true,
        businessUnitTitle: true,
        premiseAddress: true,
        activityJob: { select: { title: true } },
      },
    });
    if (!person) throw new NotFoundException('شخص یافت نشد');
    const fields = {
      fullName: person.fullName,
      nationalId: person.nationalId ?? '',
      trackingCode: person.caseTrackingCode ?? '',
      jobTitle: person.activityJob?.title ?? '',
      unitTitle: person.businessUnitTitle ?? '',
      address: person.premiseAddress ?? '',
      phone: person.phone ?? '',
      date: new Date().toISOString().slice(0, 10),
      centerName: row.inquiryCenter.name,
    };
    const center = await this.prisma.inquiryCenter.findUnique({
      where: { id: row.inquiryCenterId },
      select: { letterTitle: true, letterBody: true, name: true, phone: true },
    });
    return {
      id: row.id,
      centerName: center?.name ?? row.inquiryCenter.name,
      centerPhone: center?.phone ?? null,
      nationalId: person.nationalId,
      letterTitle: center?.letterTitle?.trim() || `استعلام ${fields.centerName}`,
      letterBody: center?.letterBody?.trim() || DEFAULT_LETTER_BODY,
      fields,
    };
  }

  async decide(
    id: string,
    actor: InquiryActor,
    input: {
      status: string;
      note?: string | null;
      channel: CaseInquiryChannel;
      file?: { buffer: Buffer; mimeType: string; originalName: string };
    },
  ) {
    const row = await this.findReadable(id, actor);
    if (input.channel === CaseInquiryChannel.SYSTEM && !actor.isAdmin && row.inquiryCenter.officerId !== actor.id) {
      throw new ForbiddenException('این استعلام برای مرکز شما نیست');
    }
    if (row.status !== CaseInquiryStatus.PENDING) {
      throw new BadRequestException('نتیجه این استعلام قبلاً ثبت شده است');
    }
    if (input.status !== CaseInquiryStatus.APPROVED && input.status !== CaseInquiryStatus.REJECTED) {
      throw new BadRequestException('نتیجه استعلام معتبر نیست');
    }
    const note = input.note?.trim() || null;
    if (input.status === CaseInquiryStatus.REJECTED && !note) {
      throw new BadRequestException('برای رد استعلام توضیحات لازم است');
    }
    if (input.file?.buffer?.length) {
      const fileId = randomUUID();
      const stored = await this.files.saveInquiry({
        personId: row.userId,
        inquiryId: row.id,
        fileId,
        buffer: input.file.buffer,
        mimeType: input.file.mimeType,
        originalName: input.file.originalName,
      });
      await this.prisma.caseInquiryFile.create({
        data: {
          id: fileId,
          caseInquiryId: row.id,
          storageKey: stored.storageKey,
          originalName: stored.originalName,
          mimeType: stored.mimeType,
          byteSize: stored.byteSize,
          uploadedById: actor.id,
        },
      });
    }
    const saved = await this.prisma.caseInquiry.update({
      where: { id: row.id },
      data: {
        status: input.status,
        channel: input.channel,
        note,
        decidedById: actor.id,
        decidedAt: new Date(),
      },
      include: inquiryInclude,
    });
    return mapInquiry(saved);
  }

  async reopen(id: string) {
    const row = await this.prisma.caseInquiry.findUnique({ where: { id }, include: inquiryInclude });
    if (!row) throw new NotFoundException('استعلام یافت نشد');
    const saved = await this.prisma.caseInquiry.update({
      where: { id },
      data: {
        status: CaseInquiryStatus.PENDING,
        channel: null,
        note: null,
        decidedById: null,
        decidedAt: null,
      },
      include: inquiryInclude,
    });
    return mapInquiry(saved);
  }

  async inbox(actor: InquiryActor, query: FindCaseInquiriesQueryDto) {
    const q = query.q?.trim();
    const digits = q ? normalizeSearchDigits(q) : '';
    const where: Prisma.CaseInquiryWhereInput = {
      status: query.status,
      ...(actor.isAdmin ? {} : { inquiryCenter: { officerId: actor.id } }),
      OR: q
        ? [
            { user: { fullName: containsInsensitive(q) } },
            { user: { businessUnitTitle: containsInsensitive(q) } },
            { inquiryCenter: { name: containsInsensitive(q) } },
            { user: { activityJob: { title: containsInsensitive(q) } } },
            ...(digits
              ? [
                  { user: { nationalId: { contains: digits } } },
                  { user: { caseTrackingCode: { contains: digits } } },
                ]
              : []),
          ]
        : undefined,
    };
    const orderBy = resolveSortOrder<Prisma.CaseInquiryOrderByWithRelationInput>(
      query.sortBy,
      query.sortDir,
      {
        applicant: (dir) => ({ user: { fullName: dir } }),
        nationalId: (dir) => ({ user: { nationalId: dir } }),
        center: (dir) => ({ inquiryCenter: { name: dir } }),
        job: (dir) => ({ user: { activityJob: { title: dir } } }),
        status: (dir) => ({ status: dir }),
        createdAt: (dir) => ({ createdAt: dir }),
      },
      [{ createdAt: 'desc' }, { id: 'asc' }],
    );
    const select = {
      id: true,
      status: true,
      channel: true,
      createdAt: true,
      inquiryCenter: { select: { id: true, name: true } },
      user: {
        select: {
          id: true,
          fullName: true,
          nationalId: true,
          caseTrackingCode: true,
          businessUnitTitle: true,
          activityJob: { select: { title: true } },
        },
      },
    } satisfies Prisma.CaseInquirySelect;

    const mapRow = (row: Prisma.CaseInquiryGetPayload<{ select: typeof select }>) => ({
      id: row.id,
      status: row.status,
      channel: row.channel,
      createdAt: row.createdAt,
      centerName: row.inquiryCenter.name,
      applicantName: row.user.fullName,
      nationalId: row.user.nationalId,
      trackingCode: row.user.caseTrackingCode,
      unitTitle: row.user.businessUnitTitle,
      jobTitle: row.user.activityJob?.title ?? null,
    });

    if (!wantsPagination(query)) {
      const items = await this.prisma.caseInquiry.findMany({ where, orderBy, select });
      return items.map(mapRow);
    }
    const { page, pageSize, skip, take } = paginationArgs(query);
    const [items, total] = await Promise.all([
      this.prisma.caseInquiry.findMany({ where, orderBy, skip, take, select }),
      this.prisma.caseInquiry.count({ where }),
    ]);
    return paginatedResult(items.map(mapRow), total, page, pageSize);
  }

  async detail(id: string, actor: InquiryActor) {
    const row = await this.findReadable(id, actor);
    const person = await this.prisma.user.findUnique({
      where: { id: row.userId },
      select: {
        fullName: true,
        nationalId: true,
        caseTrackingCode: true,
        phone: true,
        businessUnitTitle: true,
        activityJob: { select: { title: true } },
      },
    });
    return {
      ...mapInquiry(row),
      applicant: person
        ? {
            fullName: person.fullName,
            nationalId: person.nationalId,
            trackingCode: person.caseTrackingCode,
            phone: person.phone,
            unitTitle: person.businessUnitTitle,
            jobTitle: person.activityJob?.title ?? null,
          }
        : null,
    };
  }

  async readFile(fileId: string, actor: InquiryActor) {
    const file = await this.prisma.caseInquiryFile.findUnique({
      where: { id: fileId },
      include: { caseInquiry: { include: inquiryInclude } },
    });
    if (!file) throw new NotFoundException('پیوست استعلام یافت نشد');
    this.assertReadable(file.caseInquiry, actor);
    const data = await this.files.read(file.storageKey);
    return {
      mimeType: file.mimeType,
      byteSize: file.byteSize,
      originalName: file.originalName,
      data,
    };
  }

  private async findReadable(id: string, actor: InquiryActor) {
    const row = await this.prisma.caseInquiry.findUnique({ where: { id }, include: inquiryInclude });
    if (!row) throw new NotFoundException('استعلام یافت نشد');
    this.assertReadable(row, actor);
    return row;
  }

  private assertReadable(row: InquiryRecord, actor: InquiryActor) {
    if (actor.isAdmin || actor.formation) return;
    if (row.inquiryCenter.officerId === actor.id) return;
    throw new ForbiddenException('این استعلام برای مرکز شما نیست');
  }
}
