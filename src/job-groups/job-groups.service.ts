import {
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
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateJobGroupDto } from './dto/create-job-group.dto';
import { FindJobGroupsQueryDto } from './dto/find-job-groups-query.dto';
import { UpdateJobGroupDto } from './dto/update-job-group.dto';

const groupSelect = {
  id: true,
  title: true,
  titleEn: true,
  description: true,
  code: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { jobs: true } },
} satisfies Prisma.JobGroupSelect;

@Injectable()
export class JobGroupsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: FindJobGroupsQueryDto) {
    const where: Prisma.JobGroupWhereInput = {
      isActive: query.isActive,
      OR: this.searchFilter(query.q),
    };
    const orderBy = resolveSortOrder<Prisma.JobGroupOrderByWithRelationInput>(
      query.sortBy,
      query.sortDir,
      {
        title: (dir) => ({ title: dir }),
        titleEn: (dir) => ({ titleEn: dir }),
        code: (dir) => ({ code: dir }),
        isActive: (dir) => ({ isActive: dir }),
        jobCount: (dir) => ({ jobs: { _count: dir } }),
      },
      [{ createdAt: 'desc' }, { id: 'asc' }],
    );
    if (!wantsPagination(query)) {
      return this.prisma.jobGroup.findMany({
        where,
        orderBy,
        select: groupSelect,
      });
    }
    const { page, pageSize, skip, take } = paginationArgs(query);
    const [items, total] = await Promise.all([
      this.prisma.jobGroup.findMany({
        where,
        orderBy,
        skip,
        take,
        select: groupSelect,
      }),
      this.prisma.jobGroup.count({ where }),
    ]);
    return paginatedResult(items, total, page, pageSize);
  }

  async findOne(id: string) {
    const item = await this.prisma.jobGroup.findUnique({
      where: { id },
      select: groupSelect,
    });
    if (!item) {
      throw new NotFoundException('گروه شغلی یافت نشد');
    }
    return item;
  }

  async create(dto: CreateJobGroupDto) {
    try {
      return await this.prisma.jobGroup.create({
        data: {
          title: dto.title,
          titleEn: dto.titleEn,
          description: dto.description,
          code: dto.code,
          isActive: dto.isActive,
        },
        select: groupSelect,
      });
    } catch (error) {
      this.rethrowUnique(error);
    }
  }

  async update(id: string, dto: UpdateJobGroupDto) {
    await this.findOne(id);
    try {
      return await this.prisma.jobGroup.update({
        where: { id },
        data: {
          title: dto.title,
          titleEn: dto.titleEn,
          description: dto.description,
          code: dto.code,
          isActive: dto.isActive,
        },
        select: groupSelect,
      });
    } catch (error) {
      this.rethrowUnique(error);
    }
  }

  async remove(id: string) {
    await this.findOne(id);
    const jobs = await this.prisma.job.count({ where: { groupId: id } });
    if (jobs > 0) {
      throw new ConflictException('ابتدا شغل‌های این گروه را حذف کنید');
    }
    await this.prisma.jobGroup.delete({ where: { id } });
    return { ok: true };
  }

  private searchFilter(q?: string): Prisma.JobGroupWhereInput[] | undefined {
    const term = q?.trim();
    if (!term) {
      return undefined;
    }
    return [
      { title: containsInsensitive(term) },
      { titleEn: containsInsensitive(term) },
      { description: containsInsensitive(term) },
      { code: containsInsensitive(term) },
    ];
  }

  private rethrowUnique(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      const target = error.meta?.target;
      const fields = Array.isArray(target) ? target.join(' ') : String(target ?? '');
      if (fields.includes('code')) {
        throw new ConflictException('این کد قبلاً ثبت شده است');
      }
      if (fields.includes('titleEn')) {
        throw new ConflictException('این عنوان انگلیسی قبلاً ثبت شده است');
      }
      throw new ConflictException('این گروه شغلی قبلاً ثبت شده است');
    }
    throw error;
  }
}
