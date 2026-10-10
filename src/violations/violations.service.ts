import {
  BadRequestException,
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
import { Prisma, ViolationStatus } from '../generated/prisma/client';
import { ImagesService } from '../images/images.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  calendarParts,
  currentCalendarYear,
  formatDateOnly,
  parseDateOnly,
  reportCalendar,
} from './calendar';
import { CreateProceedingDto } from './dto/create-proceeding.dto';
import { CreateViolationDto } from './dto/create-violation.dto';
import { FindProceedingsQueryDto } from './dto/find-proceedings-query.dto';
import { FindViolationsQueryDto } from './dto/find-violations-query.dto';
import { UpdateProceedingDto } from './dto/update-proceeding.dto';
import { UpdateViolationDto } from './dto/update-violation.dto';
import { ViolationReportQueryDto } from './dto/violation-report-query.dto';
import { violationStatuses } from './violation-status';
import {
  purgeUploads,
  storeUploads,
  type UploadFile,
} from './stored-uploads';

const attachmentSelect = {
  id: true,
  kind: true,
  originalName: true,
  sortOrder: true,
  image: { select: { mimeType: true } },
  file: { select: { mimeType: true } },
} satisfies Prisma.ViolationAttachmentSelect;

const caseFileSelect = {
  id: true,
  userId: true,
  trackingCode: true,
  licenseNumber: true,
  businessUnitTitle: true,
  formationStep: true,
  activityJob: { select: { title: true, group: { select: { title: true } } } },
  user: { select: { fullName: true } },
} satisfies Prisma.CaseFileSelect;

const violationSelect = {
  id: true,
  nationalId: true,
  violationTypeId: true,
  violationType: { select: { id: true, title: true } },
  occurredAt: true,
  description: true,
  status: true,
  caseFile: { select: caseFileSelect },
  createdAt: true,
  updatedAt: true,
  attachments: { orderBy: { sortOrder: 'asc' as const }, select: attachmentSelect },
  _count: { select: { proceedings: true } },
} satisfies Prisma.ViolationSelect;

@Injectable()
export class ViolationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly images: ImagesService,
  ) {}

  async findAll(query: FindViolationsQueryDto) {
    const where = await this.listWhere(query);
    const orderBy = resolveSortOrder<Prisma.ViolationOrderByWithRelationInput>(
      query.sortBy,
      query.sortDir,
      {
        nationalId: (dir) => ({ nationalId: dir }),
        violationType: (dir) => ({ violationType: { title: dir } }),
        occurredAt: (dir) => ({ occurredAt: dir }),
        status: (dir) => ({ status: dir }),
        caseTrackingCode: (dir) => ({ caseFile: { trackingCode: dir } }),
        licenseNumber: (dir) => ({ caseFile: { licenseNumber: dir } }),
        createdAt: (dir) => ({ createdAt: dir }),
      },
      [{ createdAt: 'desc' }, { id: 'asc' }],
    );
    if (!wantsPagination(query)) {
      const items = await this.prisma.violation.findMany({
        where,
        orderBy,
        select: violationSelect,
      });
      return this.withPeople(items);
    }
    const { page, pageSize, skip, take } = paginationArgs(query);
    const [items, total] = await Promise.all([
      this.prisma.violation.findMany({
        where,
        orderBy,
        skip,
        take,
        select: violationSelect,
      }),
      this.prisma.violation.count({ where }),
    ]);
    return paginatedResult(await this.withPeople(items), total, page, pageSize);
  }

  async report(query: ViolationReportQueryDto) {
    const calendar = reportCalendar();
    const rows = await this.prisma.violation.findMany({
      select: {
        occurredAt: true,
        status: true,
        nationalId: true,
        violationTypeId: true,
        violationType: { select: { title: true } },
      },
    });
    const parts = rows.map((row) => ({
      status: row.status,
      nationalId: row.nationalId,
      violationTypeId: row.violationTypeId,
      violationTypeTitle: row.violationType.title,
      ...calendarParts(row.occurredAt, calendar),
    }));
    const current = currentCalendarYear(calendar);
    const span = query.span === 'all' ? 'all' : 'year';
    const year = query.year ?? current;
    const month = span === 'year' ? (query.month ?? null) : null;
    const scoped = parts.filter((item) => {
      if (span === 'all') return true;
      if (item.year !== year) return false;
      if (month && item.month !== month) return false;
      return true;
    });
    const yearSet = new Set(parts.map((item) => item.year));
    yearSet.add(current);
    if (span === 'year') yearSet.add(year);
    const years = [...yearSet].sort((left, right) => right - left);
    return {
      calendar,
      span,
      year,
      month,
      total: scoped.length,
      byStatus: violationStatuses.map((status) => ({
        status,
        count: scoped.filter((item) => item.status === status).length,
      })),
      byType: typeCounts(scoped),
      byPerson: await this.topPeople(scoped),
      monthly: Array.from({ length: 12 }, (_, index) => ({
        month: index + 1,
        count: parts.filter(
          (item) => item.year === year && item.month === index + 1,
        ).length,
      })),
      yearly: years.map((itemYear) => ({
        year: itemYear,
        count: parts.filter((item) => item.year === itemYear).length,
      })),
      years,
    };
  }

  async findPerson(nationalId: string) {
    const person = await this.prisma.user.findUnique({
      where: { nationalId },
      select: {
        firstName: true,
        lastName: true,
        fullName: true,
        birthPlace: true,
        identityCertificateNo: true,
        photoId: true,
        caseFiles: {
          where: { formationStep: { gt: 0 } },
          orderBy: [{ formationStep: 'desc' }, { createdAt: 'desc' }],
          select: caseFileSelect,
        },
      },
    });
    const files = person?.caseFiles ?? [];
    const counts = await this.violationCounts(files.map((item) => item.id));
    return {
      nationalId,
      found: Boolean(person),
      firstName: person?.firstName ?? null,
      lastName: person?.lastName ?? null,
      fullName: person?.fullName ?? null,
      birthPlace: person?.birthPlace ?? null,
      identityCertificateNo: person?.identityCertificateNo ?? null,
      photoId: person?.photoId ?? null,
      cases: files.flatMap((row) => {
        const mapped = mapCaseFile(row);
        if (!mapped) return [];
        return [{ ...mapped, violationCount: counts.get(row.id) ?? 0 }];
      }),
    };
  }

  async findByCase(caseFileId: string) {
    const file = await this.prisma.caseFile.findUnique({
      where: { id: caseFileId },
      select: { id: true },
    });
    if (!file) throw new NotFoundException('پرونده یافت نشد');
    const items = await this.prisma.violation.findMany({
      where: { caseFileId },
      orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
      select: {
        id: true,
        occurredAt: true,
        description: true,
        status: true,
        violationType: { select: { id: true, title: true } },
      },
    });
    return items.map((item) => ({
      id: item.id,
      description: item.description,
      status: item.status,
      violationType: item.violationType,
      occurredAt: formatDateOnly(item.occurredAt),
    }));
  }

  async findOne(id: string) {
    const item = await this.prisma.violation.findUnique({
      where: { id },
      select: violationSelect,
    });
    if (!item) throw new NotFoundException('تخلف یافت نشد');
    const [mapped] = await this.withPeople([item]);
    return mapped;
  }

  async create(dto: CreateViolationDto, userId: string, files?: UploadFile[]) {
    await this.ensureType(dto.violationTypeId);
    const linked = await this.ensureCase(dto.nationalId, dto.caseUserId);
    const occurredAt = this.requireDate(dto.occurredAt);
    const uploads = await storeUploads(files, this.images, this.prisma);
    try {
      const item = await this.prisma.violation.create({
        data: {
          nationalId: dto.nationalId,
          violationTypeId: dto.violationTypeId,
          occurredAt,
          description: dto.description,
          status: dto.status ?? ViolationStatus.REGISTERED,
          caseUserId: linked?.userId ?? null,
          caseFileId: linked?.id ?? null,
          createdById: userId,
          attachments: {
            create: uploads.map((file, index) => ({
              kind: file.kind,
              imageId: file.imageId,
              fileId: file.fileId,
              originalName: file.originalName,
              sortOrder: index,
            })),
          },
        },
        select: violationSelect,
      });
      const [mapped] = await this.withPeople([item]);
      return mapped;
    } catch (error) {
      await purgeUploads(this.prisma, uploads);
      throw error;
    }
  }

  async update(
    id: string,
    dto: UpdateViolationDto,
    files?: UploadFile[],
  ) {
    const current = await this.findOne(id);
    if (dto.violationTypeId) await this.ensureType(dto.violationTypeId);
    const linked =
      dto.caseUserId === undefined
        ? undefined
        : await this.ensureCase(dto.nationalId ?? current.nationalId, dto.caseUserId);
    const occurredAt = dto.occurredAt
      ? this.requireDate(dto.occurredAt)
      : undefined;
    const uploads = await storeUploads(files, this.images, this.prisma);
    const nextSort = nextAttachmentSort(current.attachments, dto.removeAttachmentIds);
    let saved = false;
    try {
      await this.prisma.violation.update({
        where: { id },
        data: {
          nationalId: dto.nationalId,
          violationTypeId: dto.violationTypeId,
          occurredAt,
          description: dto.description,
          status: dto.status,
          caseUserId: linked === undefined ? undefined : linked?.userId ?? null,
          caseFileId: linked === undefined ? undefined : linked?.id ?? null,
          attachments: uploads.length
            ? {
                create: uploads.map((file, index) => ({
                  kind: file.kind,
                  imageId: file.imageId,
                  fileId: file.fileId,
                  originalName: file.originalName,
                  sortOrder: nextSort + index,
                })),
              }
            : undefined,
        },
      });
      saved = true;
      await this.removeViolationAttachments(id, dto.removeAttachmentIds);
      return this.findOne(id);
    } catch (error) {
      if (!saved) await purgeUploads(this.prisma, uploads);
      throw error;
    }
  }

  async remove(id: string) {
    const item = await this.prisma.violation.findUnique({
      where: { id },
      select: {
        attachments: { select: { imageId: true, fileId: true } },
        proceedings: {
          select: {
            attachments: { select: { imageId: true, fileId: true } },
          },
        },
      },
    });
    if (!item) throw new NotFoundException('تخلف یافت نشد');
    const blobs = [
      ...item.attachments,
      ...item.proceedings.flatMap((proceeding) => proceeding.attachments),
    ];
    await this.prisma.violation.delete({ where: { id } });
    await purgeUploads(this.prisma, blobs);
    return { ok: true };
  }

  async readViolationAttachment(violationId: string, attachmentId: string) {
    const attachment = await this.prisma.violationAttachment.findFirst({
      where: { id: attachmentId, violationId },
      select: {
        originalName: true,
        image: true,
        file: true,
      },
    });
    if (!attachment) throw new NotFoundException('پیوست یافت نشد');
    return this.blobResponse(attachment);
  }

  async findProceedings(violationId: string, query: FindProceedingsQueryDto) {
    await this.ensureViolation(violationId);
    const where: Prisma.ViolationProceedingWhereInput = {
      violationId,
      OR: query.q
        ? [
            { title: containsInsensitive(query.q) },
            { description: containsInsensitive(query.q) },
          ]
        : undefined,
    };
    const orderBy =
      resolveSortOrder<Prisma.ViolationProceedingOrderByWithRelationInput>(
        query.sortBy,
        query.sortDir,
        {
          occurredAt: (dir) => ({ occurredAt: dir }),
          title: (dir) => ({ title: dir }),
          description: (dir) => ({ description: dir }),
          attachmentCount: (dir) => ({ attachments: { _count: dir } }),
        },
        [{ occurredAt: 'desc' }, { id: 'asc' }],
      );
    const select = {
      id: true,
      violationId: true,
      occurredAt: true,
      title: true,
      description: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { attachments: true } },
    } satisfies Prisma.ViolationProceedingSelect;
    if (!wantsPagination(query)) {
      const items = await this.prisma.violationProceeding.findMany({
        where,
        orderBy,
        select,
      });
      return items.map((item) => this.mapProceeding(item));
    }
    const { page, pageSize, skip, take } = paginationArgs(query);
    const [items, total] = await Promise.all([
      this.prisma.violationProceeding.findMany({
        where,
        orderBy,
        skip,
        take,
        select,
      }),
      this.prisma.violationProceeding.count({ where }),
    ]);
    return paginatedResult(
      items.map((item) => this.mapProceeding(item)),
      total,
      page,
      pageSize,
    );
  }

  async findProceeding(violationId: string, id: string) {
    const item = await this.prisma.violationProceeding.findFirst({
      where: { id, violationId },
      select: {
        id: true,
        violationId: true,
        occurredAt: true,
        title: true,
        description: true,
        createdAt: true,
        updatedAt: true,
        attachments: { orderBy: { sortOrder: 'asc' }, select: attachmentSelect },
      },
    });
    if (!item) throw new NotFoundException('رسیدگی یافت نشد');
    return this.mapProceeding(item);
  }

  async createProceeding(
    violationId: string,
    dto: CreateProceedingDto,
    userId: string,
    files?: UploadFile[],
  ) {
    await this.ensureViolation(violationId);
    const uploads = await storeUploads(files, this.images, this.prisma);
    try {
      const item = await this.prisma.violationProceeding.create({
        data: {
          violationId,
          occurredAt: this.requireDate(dto.occurredAt),
          title: dto.title,
          description: dto.description,
          createdById: userId,
          attachments: {
            create: uploads.map((file, index) => ({
              kind: file.kind,
              imageId: file.imageId,
              fileId: file.fileId,
              originalName: file.originalName,
              sortOrder: index,
            })),
          },
        },
        select: {
          id: true,
          violationId: true,
          occurredAt: true,
          title: true,
          description: true,
          createdAt: true,
          updatedAt: true,
          attachments: { orderBy: { sortOrder: 'asc' }, select: attachmentSelect },
        },
      });
      return this.mapProceeding(item);
    } catch (error) {
      await purgeUploads(this.prisma, uploads);
      throw error;
    }
  }

  async updateProceeding(
    violationId: string,
    id: string,
    dto: UpdateProceedingDto,
    files?: UploadFile[],
  ) {
    const current = await this.findProceeding(violationId, id);
    const uploads = await storeUploads(files, this.images, this.prisma);
    const nextSort = nextAttachmentSort(
      current.attachments ?? [],
      dto.removeAttachmentIds,
    );
    let saved = false;
    try {
      await this.prisma.violationProceeding.update({
        where: { id },
        data: {
          occurredAt: dto.occurredAt
            ? this.requireDate(dto.occurredAt)
            : undefined,
          title: dto.title,
          description: dto.description,
          attachments: uploads.length
            ? {
                create: uploads.map((file, index) => ({
                  kind: file.kind,
                  imageId: file.imageId,
                  fileId: file.fileId,
                  originalName: file.originalName,
                  sortOrder: nextSort + index,
                })),
              }
            : undefined,
        },
        select: {
          id: true,
          violationId: true,
          occurredAt: true,
          title: true,
          description: true,
          createdAt: true,
          updatedAt: true,
          attachments: { orderBy: { sortOrder: 'asc' }, select: attachmentSelect },
        },
      });
      saved = true;
      await this.removeProceedingAttachments(id, dto.removeAttachmentIds);
      return this.findProceeding(violationId, id);
    } catch (error) {
      if (!saved) await purgeUploads(this.prisma, uploads);
      throw error;
    }
  }

  async removeProceeding(violationId: string, id: string) {
    const item = await this.prisma.violationProceeding.findFirst({
      where: { id, violationId },
      select: {
        attachments: { select: { imageId: true, fileId: true } },
      },
    });
    if (!item) throw new NotFoundException('رسیدگی یافت نشد');
    await this.prisma.violationProceeding.delete({ where: { id } });
    await purgeUploads(this.prisma, item.attachments);
    return { ok: true };
  }

  async readProceedingAttachment(
    violationId: string,
    proceedingId: string,
    attachmentId: string,
  ) {
    const attachment = await this.prisma.violationProceedingAttachment.findFirst({
      where: {
        id: attachmentId,
        proceedingId,
        proceeding: { violationId },
      },
      select: { originalName: true, image: true, file: true },
    });
    if (!attachment) throw new NotFoundException('پیوست یافت نشد');
    return this.blobResponse(attachment);
  }

  private async listWhere(query: FindViolationsQueryDto) {
    const from = query.from ? this.requireDate(query.from) : undefined;
    const to = query.to ? this.requireDate(query.to) : undefined;
    if (from && to && from.getTime() > to.getTime()) {
      throw new BadRequestException('بازه تاریخ نامعتبر است');
    }
    const where: Prisma.ViolationWhereInput = {
      status: query.status,
      violationTypeId: query.violationTypeId,
      nationalId: query.nationalId,
      occurredAt: from || to ? { gte: from, lte: to } : undefined,
    };
    const q = query.q?.trim();
    if (!q) return where;
    const digits = normalizeSearchDigits(q);
    const people = await this.prisma.user.findMany({
      where: {
        nationalId: { not: null },
        fullName: containsInsensitive(q),
      },
      select: { nationalId: true },
      take: 100,
    });
    const nationalIds = people
      .map((person) => person.nationalId)
      .filter((id): id is string => Boolean(id));
    where.OR = [
      { description: containsInsensitive(q) },
      { violationType: { title: containsInsensitive(q) } },
      digits
        ? { nationalId: { contains: digits } }
        : { nationalId: containsInsensitive(q) },
      {
        caseFile: {
          OR: [
            {
              trackingCode: digits
                ? { contains: digits }
                : containsInsensitive(q),
            },
            {
              licenseNumber: digits
                ? { contains: digits }
                : containsInsensitive(q),
            },
            { businessUnitTitle: containsInsensitive(q) },
            { activityJob: { title: containsInsensitive(q) } },
            { activityJob: { group: { title: containsInsensitive(q) } } },
          ],
        },
      },
      ...(nationalIds.length ? [{ nationalId: { in: nationalIds } }] : []),
    ];
    return where;
  }

  private async withPeople<T extends { nationalId: string; occurredAt: Date; createdAt: Date; updatedAt: Date; attachments: AttachmentRow[] }>(
    items: T[],
  ) {
    const nationalIds = [...new Set(items.map((item) => item.nationalId))];
    const people = nationalIds.length
      ? await this.prisma.user.findMany({
          where: { nationalId: { in: nationalIds } },
          select: { id: true, nationalId: true, fullName: true },
        })
      : [];
    const byNationalId = new Map(
      people
        .filter((person) => person.nationalId)
        .map((person) => [person.nationalId as string, person]),
    );
    return items.map((item) => {
      const person = byNationalId.get(item.nationalId);
      return {
        ...this.mapDates(item),
        person: person
          ? { id: person.id, fullName: person.fullName }
          : null,
      };
    });
  }

  private async topPeople(rows: { nationalId: string }[]) {
    const counts = new Map<string, number>();
    for (const row of rows) {
      counts.set(row.nationalId, (counts.get(row.nationalId) ?? 0) + 1);
    }
    const ranked = [...counts.entries()]
      .sort(
        (left, right) =>
          right[1] - left[1] || left[0].localeCompare(right[0]),
      )
      .slice(0, 10);
    if (!ranked.length) return [];
    const people = await this.prisma.user.findMany({
      where: { nationalId: { in: ranked.map(([nationalId]) => nationalId) } },
      select: { nationalId: true, fullName: true },
    });
    const nameByNationalId = new Map(
      people
        .filter((person) => person.nationalId)
        .map((person) => [person.nationalId as string, person.fullName]),
    );
    return ranked
      .map(([nationalId, count]) => ({
        nationalId,
        fullName: nameByNationalId.get(nationalId) ?? null,
        count,
      }))
      .sort((left, right) => {
        if (right.count !== left.count) return right.count - left.count;
        const leftName = left.fullName ?? left.nationalId;
        const rightName = right.fullName ?? right.nationalId;
        return (
          leftName.localeCompare(rightName, 'fa') ||
          left.nationalId.localeCompare(right.nationalId)
        );
      });
  }

  private async violationCounts(caseFileIds: string[]) {
    const counts = new Map<string, number>();
    if (!caseFileIds.length) return counts;
    const rows = await this.prisma.violation.groupBy({
      by: ['caseFileId'],
      where: { caseFileId: { in: caseFileIds } },
      _count: { _all: true },
    });
    for (const row of rows) {
      if (row.caseFileId) counts.set(row.caseFileId, row._count._all);
    }
    return counts;
  }

  private mapDates<
    T extends {
      occurredAt: Date;
      createdAt: Date;
      updatedAt: Date;
      attachments: AttachmentRow[];
      caseFile?: CaseFileRow | null;
    },
  >(item: T) {
    const { caseFile, ...rest } = item;
    return {
      ...rest,
      caseFile: mapCaseFile(caseFile),
      occurredAt: formatDateOnly(item.occurredAt),
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
      attachments: item.attachments.map(this.publicAttachment),
    };
  }

  private mapProceeding<
    T extends {
      occurredAt: Date;
      createdAt: Date;
      updatedAt: Date;
      attachments?: AttachmentRow[];
    },
  >(item: T) {
    return {
      ...item,
      occurredAt: formatDateOnly(item.occurredAt),
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
      attachments: item.attachments?.map(this.publicAttachment),
    };
  }

  private publicAttachment = (item: AttachmentRow) => ({
    id: item.id,
    kind: item.kind,
    originalName: item.originalName,
    sortOrder: item.sortOrder,
    mimeType: item.file?.mimeType ?? item.image?.mimeType ?? null,
  });

  private async ensureType(id: string) {
    const type = await this.prisma.violationType.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!type) throw new BadRequestException('نوع تخلف یافت نشد');
  }

  private async ensureCase(nationalId: string, caseUserId?: string | null) {
    if (!caseUserId) return null;
    const row = await this.prisma.caseFile.findFirst({
      where: { id: caseUserId, formationStep: { gt: 0 }, user: { nationalId } },
      select: { id: true, userId: true },
    });
    if (!row) {
      throw new BadRequestException('پرونده انتخاب‌شده متعلق به این کد ملی نیست');
    }
    return row;
  }

  private async ensureViolation(id: string) {
    const item = await this.prisma.violation.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!item) throw new NotFoundException('تخلف یافت نشد');
  }

  private requireDate(value: string) {
    const date = parseDateOnly(value);
    if (!date) throw new BadRequestException('تاریخ نامعتبر است');
    return date;
  }

  private async removeViolationAttachments(violationId: string, ids?: string[]) {
    if (!ids?.length) return;
    const rows = await this.prisma.violationAttachment.findMany({
      where: { violationId, id: { in: ids } },
      select: { id: true, imageId: true, fileId: true },
    });
    if (!rows.length) return;
    await this.prisma.violationAttachment.deleteMany({
      where: { id: { in: rows.map((row) => row.id) } },
    });
    await purgeUploads(this.prisma, rows);
  }

  private async removeProceedingAttachments(proceedingId: string, ids?: string[]) {
    if (!ids?.length) return;
    const rows = await this.prisma.violationProceedingAttachment.findMany({
      where: { proceedingId, id: { in: ids } },
      select: { id: true, imageId: true, fileId: true },
    });
    if (!rows.length) return;
    await this.prisma.violationProceedingAttachment.deleteMany({
      where: { id: { in: rows.map((row) => row.id) } },
    });
    await purgeUploads(this.prisma, rows);
  }

  private blobResponse(attachment: {
    originalName: string | null;
    image: { mimeType: string; data: Uint8Array; originalName: string | null } | null;
    file: { mimeType: string; data: Uint8Array; originalName: string | null } | null;
  }) {
    const blob = attachment.image ?? attachment.file;
    if (!blob) throw new NotFoundException('پیوست یافت نشد');
    return {
      mimeType: blob.mimeType,
      data: Buffer.from(blob.data),
      name: attachment.originalName || blob.originalName || 'file',
    };
  }
}

type AttachmentRow = {
  id: string;
  kind: string;
  originalName: string | null;
  sortOrder: number;
  image: { mimeType: string } | null;
  file: { mimeType: string } | null;
};

function nextAttachmentSort(
  attachments: { id: string; sortOrder: number }[],
  removeIds?: string[],
) {
  const removed = new Set(removeIds ?? []);
  return (
    attachments
      .filter((item) => !removed.has(item.id))
      .reduce((max, item) => Math.max(max, item.sortOrder), -1) + 1
  );
}

type CaseFileRow = {
  id: string;
  userId: string;
  trackingCode: string | null;
  licenseNumber: string | null;
  businessUnitTitle: string | null;
  formationStep: number;
  activityJob: { title: string; group: { title: string } | null } | null;
  user: { fullName: string };
};

function typeCounts(
  rows: { violationTypeId: string; violationTypeTitle: string }[],
) {
  const counts = new Map<string, { id: string; title: string; count: number }>();
  for (const row of rows) {
    const current = counts.get(row.violationTypeId);
    if (current) current.count += 1;
    else {
      counts.set(row.violationTypeId, {
        id: row.violationTypeId,
        title: row.violationTypeTitle,
        count: 1,
      });
    }
  }
  return [...counts.values()].sort(
    (left, right) => right.count - left.count || left.title.localeCompare(right.title, 'fa'),
  );
}

function mapCaseFile(row?: CaseFileRow | null) {
  if (!row || row.formationStep <= 0) return null;
  return {
    id: row.id,
    fullName: row.user.fullName,
    caseTrackingCode: row.trackingCode,
    licenseNumber: row.licenseNumber,
    businessUnitTitle: row.businessUnitTitle,
    jobGroupTitle: row.activityJob?.group?.title ?? null,
    jobTitle: row.activityJob?.title ?? null,
    formationStep: row.formationStep,
  };
}
