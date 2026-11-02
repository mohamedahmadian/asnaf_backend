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
import { CreateUrbanZoneDto } from './dto/create-urban-zone.dto';
import { FindUrbanZonesQueryDto } from './dto/find-urban-zones-query.dto';
import { UpdateUrbanZoneDto } from './dto/update-urban-zone.dto';

const urbanZoneSelect = {
  id: true,
  title: true,
  description: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UrbanZoneSelect;

@Injectable()
export class UrbanZonesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: FindUrbanZonesQueryDto) {
    const where: Prisma.UrbanZoneWhereInput = {
      OR: query.q
        ? [
            { title: containsInsensitive(query.q) },
            { description: containsInsensitive(query.q) },
          ]
        : undefined,
    };
    const orderBy = resolveSortOrder<Prisma.UrbanZoneOrderByWithRelationInput>(
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
      return this.prisma.urbanZone.findMany({
        where,
        orderBy,
        select: urbanZoneSelect,
      });
    }
    const { page, pageSize, skip, take } = paginationArgs(query);
    const [items, total] = await Promise.all([
      this.prisma.urbanZone.findMany({
        where,
        orderBy,
        skip,
        take,
        select: urbanZoneSelect,
      }),
      this.prisma.urbanZone.count({ where }),
    ]);
    return paginatedResult(items, total, page, pageSize);
  }

  async findOne(id: string) {
    const item = await this.prisma.urbanZone.findUnique({
      where: { id },
      select: urbanZoneSelect,
    });
    if (!item) {
      throw new NotFoundException('محدوده شهری یافت نشد');
    }
    return item;
  }

  async create(dto: CreateUrbanZoneDto) {
    try {
      return await this.prisma.urbanZone.create({
        data: {
          title: dto.title,
          description: dto.description,
          isActive: dto.isActive,
        },
        select: urbanZoneSelect,
      });
    } catch (error) {
      this.rethrowUnique(error);
    }
  }

  async update(id: string, dto: UpdateUrbanZoneDto) {
    await this.findOne(id);
    try {
      return await this.prisma.urbanZone.update({
        where: { id },
        data: {
          title: dto.title,
          description: dto.description,
          isActive: dto.isActive,
        },
        select: urbanZoneSelect,
      });
    } catch (error) {
      this.rethrowUnique(error);
    }
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.urbanZone.delete({ where: { id } });
    return { ok: true };
  }

  private rethrowUnique(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException('این محدوده شهری قبلاً ثبت شده است');
    }
    throw error;
  }
}
