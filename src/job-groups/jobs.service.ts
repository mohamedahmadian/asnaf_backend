import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  containsInsensitive,
  paginatedResult,
  paginationArgs,
  wantsPagination,
} from '../common/pagination';
import { resolveSortOrder } from '../common/sort-query';
import { DocumentGender, Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateJobCatalogDto } from './dto/create-job-catalog.dto';
import { CreateJobDto } from './dto/create-job.dto';
import { FindJobsCatalogQueryDto } from './dto/find-jobs-catalog-query.dto';
import { FindJobsQueryDto } from './dto/find-jobs-query.dto';
import { UpdateJobCatalogDto } from './dto/update-job-catalog.dto';
import { UpdateJobDto } from './dto/update-job.dto';
import { JobGroupsService } from './job-groups.service';

const jobSelect = {
  id: true,
  groupId: true,
  title: true,
  titleEn: true,
  taxIntaCode: true,
  description: true,
  code: true,
  jobTypeId: true,
  annualFee: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  jobType: { select: { id: true, title: true } },
  group: { select: { id: true, title: true, titleEn: true, code: true, isActive: true } },
  inquiryCenters: {
    select: {
      inquiryCenter: { select: { id: true, name: true, isActive: true } },
    },
    orderBy: { inquiryCenter: { name: 'asc' as const } },
  },
  documents: {
    select: {
      gender: true,
      isRequired: true,
      document: {
        select: { id: true, title: true, isRequired: true, gender: true, isFixed: true },
      },
    },
    orderBy: { document: { title: 'asc' as const } },
  },
} satisfies Prisma.JobSelect;

type JobRecord = Prisma.JobGetPayload<{ select: typeof jobSelect }>;

function toFeeNumber(value: Prisma.Decimal | number | null) {
  if (value == null) return null;
  return typeof value === 'number' ? value : Number(value);
}

@Injectable()
export class JobsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly groups: JobGroupsService,
  ) {}

  async findAll(groupId: string, query: FindJobsQueryDto) {
    await this.groups.findOne(groupId);
    const where: Prisma.JobWhereInput = {
      groupId,
      isActive: query.isActive,
      OR: this.searchFilter(query.q),
    };
    const orderBy = resolveSortOrder<Prisma.JobOrderByWithRelationInput>(
      query.sortBy,
      query.sortDir,
      {
        title: (dir) => ({ title: dir }),
        code: (dir) => ({ code: dir }),
        taxIntaCode: (dir) => ({ taxIntaCode: dir }),
        jobType: (dir) => ({ jobType: { title: dir } }),
        isActive: (dir) => ({ isActive: dir }),
        inquiryCenterCount: (dir) => ({ inquiryCenters: { _count: dir } }),
      },
      [{ createdAt: 'desc' }, { id: 'asc' }],
    );
    if (!wantsPagination(query)) {
      const items = await this.prisma.job.findMany({
        where,
        orderBy,
        select: jobSelect,
      });
      return items.map((item) => this.mapJob(item));
    }
    const { page, pageSize, skip, take } = paginationArgs(query);
    const [items, total] = await Promise.all([
      this.prisma.job.findMany({
        where,
        orderBy,
        skip,
        take,
        select: jobSelect,
      }),
      this.prisma.job.count({ where }),
    ]);
    return paginatedResult(items.map((item) => this.mapJob(item)), total, page, pageSize);
  }

  async findOne(groupId: string, id: string) {
    await this.groups.findOne(groupId);
    const item = await this.prisma.job.findFirst({
      where: { id, groupId },
      select: jobSelect,
    });
    if (!item) {
      throw new NotFoundException('شغل یافت نشد');
    }
    return this.mapJob(item);
  }

  async create(groupId: string, dto: CreateJobDto) {
    await this.groups.findOne(groupId);
    await this.assertJobType(dto.jobTypeId);
    const inquiryCenterIds = await this.assertInquiryCenters(dto.inquiryCenterIds);
    try {
      const item = await this.prisma.job.create({
        data: {
          groupId,
          title: dto.title,
          titleEn: dto.titleEn?.trim() || dto.title,
          taxIntaCode: dto.taxIntaCode,
          description: dto.description,
          code: dto.code,
          jobTypeId: dto.jobTypeId,
          isActive: dto.isActive,
          inquiryCenters: {
            create: inquiryCenterIds.map((inquiryCenterId) => ({ inquiryCenterId })),
          },
        },
        select: jobSelect,
      });
      return this.mapJob(item);
    } catch (error) {
      this.rethrowUnique(error);
    }
  }

  async update(groupId: string, id: string, dto: UpdateJobDto) {
    await this.findOne(groupId, id);
    if (dto.jobTypeId) {
      await this.assertJobType(dto.jobTypeId);
    }
    const inquiryCenterIds =
      dto.inquiryCenterIds === undefined
        ? undefined
        : await this.assertInquiryCenters(dto.inquiryCenterIds);
    try {
      const item = await this.prisma.job.update({
        where: { id },
        data: {
          title: dto.title,
          titleEn: dto.titleEn,
          taxIntaCode: dto.taxIntaCode,
          description: dto.description,
          code: dto.code,
          jobTypeId: dto.jobTypeId,
          isActive: dto.isActive,
          inquiryCenters:
            inquiryCenterIds === undefined
              ? undefined
              : {
                  deleteMany: {},
                  create: inquiryCenterIds.map((inquiryCenterId) => ({
                    inquiryCenterId,
                  })),
                },
        },
        select: jobSelect,
      });
      return this.mapJob(item);
    } catch (error) {
      this.rethrowUnique(error);
    }
  }

  async remove(groupId: string, id: string) {
    await this.findOne(groupId, id);
    await this.prisma.job.delete({ where: { id } });
    return { ok: true };
  }

  async assignToGroup(jobId: string, groupId: string) {
    const current = await this.findCatalogOne(jobId);
    if (current.groupId === groupId) {
      return current;
    }
    await this.groups.findOne(groupId);
    const code = await this.codeForGroup(groupId, current.code);
    try {
      const item = await this.prisma.job.update({
        where: { id: jobId },
        data: { groupId, code },
        select: jobSelect,
      });
      return this.mapJob(item);
    } catch (error) {
      this.rethrowUnique(error);
    }
  }

  async removeFromGroup(jobId: string, groupId: string) {
    const current = await this.findCatalogOne(jobId);
    if (current.groupId !== groupId) {
      throw new NotFoundException('شغل در این گروه نیست');
    }
    const item = await this.prisma.job.update({
      where: { id: jobId },
      data: { groupId: null },
      select: jobSelect,
    });
    return this.mapJob(item);
  }

  async catalogStats() {
    const [jobCount, jobGroupCount, grouped, types] = await Promise.all([
      this.prisma.job.count(),
      this.prisma.jobGroup.count(),
      this.prisma.job.groupBy({
        by: ['jobTypeId'],
        _count: { _all: true },
      }),
      this.prisma.jobType.findMany({
        select: { id: true, title: true },
        orderBy: { title: 'asc' },
      }),
    ]);
    const counts = new Map(grouped.map((row) => [row.jobTypeId, row._count._all]));
    const byJobType = types
      .map((type) => ({
        id: type.id,
        title: type.title,
        count: counts.get(type.id) ?? 0,
      }))
      .sort((left, right) => right.count - left.count || left.title.localeCompare(right.title, 'fa'));
    return { jobCount, jobGroupCount, byJobType };
  }

  async findCatalog(query: FindJobsCatalogQueryDto) {
    const where: Prisma.JobWhereInput = {
      jobTypeId: query.jobTypeId,
      groupId: query.groupId,
      OR: this.catalogSearchFilter(query.q),
    };
    const orderBy = resolveSortOrder<Prisma.JobOrderByWithRelationInput>(
      query.sortBy,
      query.sortDir,
      {
        title: (dir) => ({ title: dir }),
        titleEn: (dir) => ({ titleEn: dir }),
        taxIntaCode: (dir) => ({ taxIntaCode: dir }),
        jobType: (dir) => ({ jobType: { title: dir } }),
        annualFee: (dir) => ({ annualFee: dir }),
        group: (dir) => ({ group: { title: dir } }),
        isActive: (dir) => ({ isActive: dir }),
      },
      [{ createdAt: 'desc' }, { id: 'asc' }],
    );
    if (!wantsPagination(query)) {
      const items = await this.prisma.job.findMany({
        where,
        orderBy,
        select: jobSelect,
      });
      return items.map((item) => this.mapJob(item));
    }
    const { page, pageSize, skip, take } = paginationArgs(query);
    const [items, total] = await Promise.all([
      this.prisma.job.findMany({
        where,
        orderBy,
        skip,
        take,
        select: jobSelect,
      }),
      this.prisma.job.count({ where }),
    ]);
    return paginatedResult(items.map((item) => this.mapJob(item)), total, page, pageSize);
  }

  async findCatalogOne(id: string) {
    const item = await this.prisma.job.findUnique({
      where: { id },
      select: jobSelect,
    });
    if (!item) {
      throw new NotFoundException('شغل یافت نشد');
    }
    return this.mapJob(item);
  }

  async createCatalog(dto: CreateJobCatalogDto) {
    await this.groups.findOne(dto.groupId);
    await this.assertJobType(dto.jobTypeId);
    const code = await this.allocateCode(dto.groupId);
    try {
      const item = await this.prisma.job.create({
        data: {
          groupId: dto.groupId,
          title: dto.title,
          titleEn: dto.titleEn,
          taxIntaCode: dto.taxIntaCode,
          code,
          jobTypeId: dto.jobTypeId,
          annualFee: dto.annualFee,
          isActive: dto.isActive ?? true,
        },
        select: jobSelect,
      });
      return this.mapJob(item);
    } catch (error) {
      this.rethrowUnique(error);
    }
  }

  async updateCatalog(id: string, dto: UpdateJobCatalogDto) {
    const current = await this.findCatalogOne(id);
    const groupId = dto.groupId ?? current.groupId;
    if (dto.groupId) {
      await this.groups.findOne(dto.groupId);
    }
    if (dto.jobTypeId) {
      await this.assertJobType(dto.jobTypeId);
    }
    const inquiryCenterIds =
      dto.inquiryCenterIds === undefined
        ? undefined
        : await this.assertInquiryCenters(dto.inquiryCenterIds);
    const jobDocuments =
      dto.jobDocuments === undefined ? undefined : await this.assertJobDocuments(dto.jobDocuments);
    const code =
      !groupId || groupId === current.groupId
        ? undefined
        : await this.codeForGroup(groupId, current.code);
    try {
      const item = await this.prisma.job.update({
        where: { id },
        data: {
          groupId: dto.groupId,
          title: dto.title,
          titleEn: dto.titleEn,
          taxIntaCode: dto.taxIntaCode,
          code,
          jobTypeId: dto.jobTypeId,
          annualFee: dto.annualFee,
          isActive: dto.isActive,
          inquiryCenters:
            inquiryCenterIds === undefined
              ? undefined
              : {
                  deleteMany: {},
                  create: inquiryCenterIds.map((inquiryCenterId) => ({
                    inquiryCenterId,
                  })),
                },
          documents:
            jobDocuments === undefined
              ? undefined
              : {
                  deleteMany: {},
                  create: jobDocuments.map((item) => ({
                    documentId: item.documentId,
                    gender: item.gender,
                    isRequired: item.isRequired,
                  })),
                },
        },
        select: jobSelect,
      });
      return this.mapJob(item);
    } catch (error) {
      this.rethrowUnique(error);
    }
  }

  async removeCatalog(id: string) {
    await this.findCatalogOne(id);
    await this.prisma.job.delete({ where: { id } });
    return { ok: true };
  }

  private mapJob(item: JobRecord) {
    return {
      ...item,
      annualFee: toFeeNumber(item.annualFee),
      inquiryCenters: item.inquiryCenters.map((row) => row.inquiryCenter),
      documents: item.documents.map((row) => ({
        ...row.document,
        gender: row.gender,
        isRequired: row.isRequired,
      })),
    };
  }

  private catalogSearchFilter(q?: string): Prisma.JobWhereInput[] | undefined {
    const term = q?.trim();
    if (!term) {
      return undefined;
    }
    return [
      { title: containsInsensitive(term) },
      { titleEn: containsInsensitive(term) },
      { taxIntaCode: containsInsensitive(term) },
      { jobType: { is: { title: containsInsensitive(term) } } },
      { group: { is: { title: containsInsensitive(term) } } },
      { group: { is: { titleEn: containsInsensitive(term) } } },
    ];
  }

  private async allocateCode(groupId: string) {
    const rows = await this.prisma.job.findMany({
      where: { groupId },
      select: { code: true },
    });
    const used = new Set(rows.map((row) => row.code));
    let next = rows.length + 1;
    for (let attempt = 0; attempt < 1000; attempt += 1) {
      const code = String(next);
      if (!used.has(code)) {
        return code;
      }
      next += 1;
    }
    throw new ConflictException('کد شغل در این گروه تکراری است');
  }

  private async codeForGroup(groupId: string, code: string) {
    const taken = await this.prisma.job.findFirst({
      where: { groupId, code },
      select: { id: true },
    });
    return taken ? this.allocateCode(groupId) : code;
  }

  private searchFilter(q?: string): Prisma.JobWhereInput[] | undefined {
    const term = q?.trim();
    if (!term) {
      return undefined;
    }
    return [
      { title: containsInsensitive(term) },
      { titleEn: containsInsensitive(term) },
      { taxIntaCode: containsInsensitive(term) },
      { description: containsInsensitive(term) },
      { code: containsInsensitive(term) },
      { jobType: { is: { title: containsInsensitive(term) } } },
      {
        inquiryCenters: {
          some: { inquiryCenter: { name: containsInsensitive(term) } },
        },
      },
    ];
  }

  private async assertJobType(jobTypeId: string) {
    const jobType = await this.prisma.jobType.findUnique({
      where: { id: jobTypeId },
      select: { id: true },
    });
    if (!jobType) {
      throw new NotFoundException('نوع خدمات یافت نشد');
    }
  }

  private async assertInquiryCenters(ids?: string[]) {
    const uniqueIds = [...new Set(ids ?? [])];
    if (uniqueIds.length === 0) {
      return uniqueIds;
    }
    const found = await this.prisma.inquiryCenter.findMany({
      where: { id: { in: uniqueIds } },
      select: { id: true },
    });
    if (found.length !== uniqueIds.length) {
      throw new NotFoundException('مرکز استعلام یافت نشد');
    }
    return uniqueIds;
  }

  private async assertJobDocuments(
    links?: { documentId: string; gender: DocumentGender; isRequired: boolean }[],
  ) {
    const byId = new Map<string, { gender: DocumentGender; isRequired: boolean }>();
    for (const link of links ?? []) {
      byId.set(link.documentId, { gender: link.gender, isRequired: link.isRequired });
    }
    const uniqueIds = [...byId.keys()];
    if (uniqueIds.length === 0) {
      return [] as { documentId: string; gender: DocumentGender; isRequired: boolean }[];
    }
    const found = await this.prisma.document.findMany({
      where: { id: { in: uniqueIds } },
      select: { id: true, isFixed: true, isRequired: true },
    });
    if (found.length !== uniqueIds.length) {
      throw new NotFoundException('مدرک یافت نشد');
    }
    if (found.some((item) => item.isFixed && item.isRequired)) {
      throw new BadRequestException('مدرک ثابت الزامی به شغل وصل نمی‌شود');
    }
    return uniqueIds.map((documentId) => {
      const link = byId.get(documentId);
      return {
        documentId,
        gender: link?.gender ?? DocumentGender.BOTH,
        isRequired: link?.isRequired ?? true,
      };
    });
  }

  private rethrowUnique(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      const target = error.meta?.target;
      const fields = Array.isArray(target) ? target.join(' ') : String(target ?? '');
      if (fields.includes('code')) {
        throw new ConflictException('کد شغل در این گروه تکراری است');
      }
      if (fields.includes('titleEn')) {
        throw new ConflictException('عنوان انگلیسی شغل در این گروه تکراری است');
      }
      if (fields.includes('taxIntaCode')) {
        throw new ConflictException('اینتاکد مالیاتی تکراری است');
      }
      throw new ConflictException('این شغل در این گروه قبلاً ثبت شده است');
    }
    throw error;
  }
}
