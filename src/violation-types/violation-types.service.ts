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
import { CreateViolationTypeDto } from './dto/create-violation-type.dto';
import { FindViolationTypesQueryDto } from './dto/find-violation-types-query.dto';
import { UpdateViolationTypeDto } from './dto/update-violation-type.dto';

const violationTypeSelect = {
  id: true,
  title: true,
  description: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ViolationTypeSelect;

@Injectable()
export class ViolationTypesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: FindViolationTypesQueryDto) {
    const where: Prisma.ViolationTypeWhereInput = {
      OR: query.q
        ? [
            { title: containsInsensitive(query.q) },
            { description: containsInsensitive(query.q) },
          ]
        : undefined,
    };
    const orderBy = resolveSortOrder<Prisma.ViolationTypeOrderByWithRelationInput>(
      query.sortBy,
      query.sortDir,
      {
        title: (dir) => ({ title: dir }),
        description: (dir) => ({ description: dir }),
        isActive: (dir) => ({ isActive: dir }),
      },
      [{ createdAt: 'desc' }, { id: 'asc' }],
    );
    if (!wantsPagination(query)) {
      return this.prisma.violationType.findMany({
        where,
        orderBy,
        select: violationTypeSelect,
      });
    }
    const { page, pageSize, skip, take } = paginationArgs(query);
    const [items, total] = await Promise.all([
      this.prisma.violationType.findMany({
        where,
        orderBy,
        skip,
        take,
        select: violationTypeSelect,
      }),
      this.prisma.violationType.count({ where }),
    ]);
    return paginatedResult(items, total, page, pageSize);
  }

  async findOne(id: string) {
    const item = await this.prisma.violationType.findUnique({
      where: { id },
      select: violationTypeSelect,
    });
    if (!item) {
      throw new NotFoundException('نوع تخلف یافت نشد');
    }
    return item;
  }

  async create(dto: CreateViolationTypeDto) {
    try {
      return await this.prisma.violationType.create({
        data: {
          title: dto.title,
          description: dto.description,
          isActive: dto.isActive,
        },
        select: violationTypeSelect,
      });
    } catch (error) {
      this.rethrowUnique(error);
    }
  }

  async update(id: string, dto: UpdateViolationTypeDto) {
    await this.findOne(id);
    try {
      return await this.prisma.violationType.update({
        where: { id },
        data: {
          title: dto.title,
          description: dto.description,
          isActive: dto.isActive,
        },
        select: violationTypeSelect,
      });
    } catch (error) {
      this.rethrowUnique(error);
    }
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.violationType.delete({ where: { id } });
    return { ok: true };
  }

  private rethrowUnique(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException('این نوع تخلف قبلاً ثبت شده است');
    }
    throw error;
  }
}
