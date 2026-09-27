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
import { CreateWorkUnitDto } from './dto/create-work-unit.dto';
import { FindWorkUnitsQueryDto } from './dto/find-work-units-query.dto';
import { UpdateWorkUnitDto } from './dto/update-work-unit.dto';

const workUnitSelect = {
  id: true,
  title: true,
  description: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.WorkUnitSelect;

@Injectable()
export class WorkUnitsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: FindWorkUnitsQueryDto) {
    const where: Prisma.WorkUnitWhereInput = {
      OR: query.q
        ? [
            { title: containsInsensitive(query.q) },
            { description: containsInsensitive(query.q) },
          ]
        : undefined,
    };
    const orderBy = resolveSortOrder<Prisma.WorkUnitOrderByWithRelationInput>(
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
      return this.prisma.workUnit.findMany({
        where,
        orderBy,
        select: workUnitSelect,
      });
    }
    const { page, pageSize, skip, take } = paginationArgs(query);
    const [items, total] = await Promise.all([
      this.prisma.workUnit.findMany({
        where,
        orderBy,
        skip,
        take,
        select: workUnitSelect,
      }),
      this.prisma.workUnit.count({ where }),
    ]);
    return paginatedResult(items, total, page, pageSize);
  }

  async findOne(id: string) {
    const item = await this.prisma.workUnit.findUnique({
      where: { id },
      select: workUnitSelect,
    });
    if (!item) {
      throw new NotFoundException('واحد سازمانی یافت نشد');
    }
    return item;
  }

  async create(dto: CreateWorkUnitDto) {
    try {
      return await this.prisma.workUnit.create({
        data: {
          title: dto.title,
          description: dto.description,
          isActive: dto.isActive,
        },
        select: workUnitSelect,
      });
    } catch (error) {
      this.rethrowUnique(error);
    }
  }

  async update(id: string, dto: UpdateWorkUnitDto) {
    await this.findOne(id);
    try {
      return await this.prisma.workUnit.update({
        where: { id },
        data: {
          title: dto.title,
          description: dto.description,
          isActive: dto.isActive,
        },
        select: workUnitSelect,
      });
    } catch (error) {
      this.rethrowUnique(error);
    }
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.workUnit.delete({ where: { id } });
    return { ok: true };
  }

  private rethrowUnique(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException('این واحد سازمانی قبلاً ثبت شده است');
    }
    throw error;
  }
}
