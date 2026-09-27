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
import { CommercialComplexesService } from './commercial-complexes.service';
import { CreateCommercialFloorDto } from './dto/create-commercial-floor.dto';
import { FindCommercialFloorsQueryDto } from './dto/find-commercial-floors-query.dto';
import { optionalText, requiredText } from './dto/text';
import { UpdateCommercialFloorDto } from './dto/update-commercial-floor.dto';

const floorSelect = {
  id: true,
  complexId: true,
  title: true,
  description: true,
  code: true,
  createdAt: true,
  updatedAt: true,
  complex: {
    select: { id: true, name: true, nameEn: true, isActive: true },
  },
  _count: { select: { lanes: true } },
} satisfies Prisma.CommercialFloorSelect;

@Injectable()
export class CommercialFloorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly complexes: CommercialComplexesService,
  ) {}

  async findAll(complexId: string, query: FindCommercialFloorsQueryDto) {
    await this.complexes.findOne(complexId);
    const where: Prisma.CommercialFloorWhereInput = {
      complexId,
      OR: query.q
        ? [
            { title: containsInsensitive(query.q) },
            { description: containsInsensitive(query.q) },
            { code: containsInsensitive(query.q) },
          ]
        : undefined,
    };
    const orderBy = resolveSortOrder<Prisma.CommercialFloorOrderByWithRelationInput>(
      query.sortBy,
      query.sortDir,
      {
        title: (dir) => ({ title: dir }),
        code: (dir) => ({ code: dir }),
        description: (dir) => ({ description: dir }),
        laneCount: (dir) => ({ lanes: { _count: dir } }),
      },
      [{ createdAt: 'desc' }, { id: 'asc' }],
    );
    if (!wantsPagination(query)) {
      return this.prisma.commercialFloor.findMany({
        where,
        orderBy,
        select: floorSelect,
      });
    }
    const { page, pageSize, skip, take } = paginationArgs(query);
    const [items, total] = await Promise.all([
      this.prisma.commercialFloor.findMany({
        where,
        orderBy,
        skip,
        take,
        select: floorSelect,
      }),
      this.prisma.commercialFloor.count({ where }),
    ]);
    return paginatedResult(items, total, page, pageSize);
  }

  async findOne(complexId: string, id: string) {
    await this.complexes.findOne(complexId);
    const item = await this.prisma.commercialFloor.findFirst({
      where: { id, complexId },
      select: floorSelect,
    });
    if (!item) {
      throw new NotFoundException('طبقه یافت نشد');
    }
    return item;
  }

  async create(complexId: string, dto: CreateCommercialFloorDto) {
    await this.complexes.findOne(complexId);
    try {
      return await this.prisma.commercialFloor.create({
        data: {
          complexId,
          title: requiredText(dto.title),
          description: optionalText(dto.description) ?? null,
          code: requiredText(dto.code),
        },
        select: floorSelect,
      });
    } catch (error) {
      this.rethrowUnique(error);
    }
  }

  async update(complexId: string, id: string, dto: UpdateCommercialFloorDto) {
    await this.findOne(complexId, id);
    try {
      return await this.prisma.commercialFloor.update({
        where: { id },
        data: {
          title: dto.title === undefined ? undefined : requiredText(dto.title),
          description: optionalText(dto.description),
          code: dto.code === undefined ? undefined : requiredText(dto.code),
        },
        select: floorSelect,
      });
    } catch (error) {
      this.rethrowUnique(error);
    }
  }

  async remove(complexId: string, id: string) {
    await this.findOne(complexId, id);
    const lanes = await this.prisma.commercialLane.count({
      where: { floorId: id },
    });
    if (lanes > 0) {
      throw new ConflictException('ابتدا لاین‌های این طبقه را حذف کنید');
    }
    await this.prisma.commercialFloor.delete({ where: { id } });
    return { ok: true };
  }

  private rethrowUnique(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException('کد طبقه در این مجتمع تکراری است');
    }
    throw error;
  }
}
