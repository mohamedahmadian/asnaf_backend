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
import { CreateJobTypeDto } from './dto/create-job-type.dto';
import { FindJobTypesQueryDto } from './dto/find-job-types-query.dto';
import { UpdateJobTypeDto } from './dto/update-job-type.dto';

const jobTypeSelect = {
  id: true,
  title: true,
  description: true,
  annualFee: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.JobTypeSelect;

function toFeeNumber(value: Prisma.Decimal | number | null) {
  if (value == null) return null;
  return typeof value === 'number' ? value : Number(value);
}

function withFee<T extends { annualFee: Prisma.Decimal | number | null }>(item: T) {
  return { ...item, annualFee: toFeeNumber(item.annualFee) };
}

@Injectable()
export class JobTypesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: FindJobTypesQueryDto) {
    const where: Prisma.JobTypeWhereInput = {
      OR: query.q
        ? [
            { title: containsInsensitive(query.q) },
            { description: containsInsensitive(query.q) },
          ]
        : undefined,
    };
    const orderBy = resolveSortOrder<Prisma.JobTypeOrderByWithRelationInput>(
      query.sortBy,
      query.sortDir,
      {
        title: (dir) => ({ title: dir }),
        description: (dir) => ({ description: dir }),
        annualFee: (dir) => ({ annualFee: dir }),
        dailyFee: (dir) => ({ annualFee: dir }),
      },
      [{ createdAt: 'asc' }, { id: 'asc' }],
    );
    if (!wantsPagination(query)) {
      const items = await this.prisma.jobType.findMany({
        where,
        orderBy,
        select: jobTypeSelect,
      });
      return items.map(withFee);
    }
    const { page, pageSize, skip, take } = paginationArgs(query);
    const [items, total] = await Promise.all([
      this.prisma.jobType.findMany({
        where,
        orderBy,
        skip,
        take,
        select: jobTypeSelect,
      }),
      this.prisma.jobType.count({ where }),
    ]);
    return paginatedResult(items.map(withFee), total, page, pageSize);
  }

  async findOne(id: string) {
    const item = await this.prisma.jobType.findUnique({
      where: { id },
      select: jobTypeSelect,
    });
    if (!item) {
      throw new NotFoundException('نوع فعالیت یافت نشد');
    }
    return withFee(item);
  }

  async create(dto: CreateJobTypeDto) {
    try {
      const item = await this.prisma.jobType.create({
        data: {
          title: dto.title,
          description: dto.description,
          annualFee: dto.annualFee,
        },
        select: jobTypeSelect,
      });
      return withFee(item);
    } catch (error) {
      this.rethrowUnique(error);
    }
  }

  async update(id: string, dto: UpdateJobTypeDto) {
    await this.findOne(id);
    try {
      const item = await this.prisma.jobType.update({
        where: { id },
        data: {
          title: dto.title,
          description: dto.description,
          annualFee: dto.annualFee,
        },
        select: jobTypeSelect,
      });
      return withFee(item);
    } catch (error) {
      this.rethrowUnique(error);
    }
  }

  async applyJobsAnnualFee(id: string, annualFee: number) {
    await this.findOne(id);
    const result = await this.prisma.job.updateMany({
      where: { jobTypeId: id },
      data: { annualFee },
    });
    return { updated: result.count };
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.jobType.delete({ where: { id } });
    return { ok: true };
  }

  private rethrowUnique(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException('این نوع فعالیت قبلاً ثبت شده است');
    }
    throw error;
  }
}
