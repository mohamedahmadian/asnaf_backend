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
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CommercialLanesService } from './commercial-lanes.service';
import { CreateCommercialUnitDto } from './dto/create-commercial-unit.dto';
import { CreateCommercialUnitSeriesDto } from './dto/create-commercial-unit-series.dto';
import { FindCommercialUnitsQueryDto } from './dto/find-commercial-units-query.dto';
import { optionalText, requiredText } from './dto/text';
import { UpdateCommercialUnitDto } from './dto/update-commercial-unit.dto';

const unitSelect = {
  id: true,
  laneId: true,
  plaque: true,
  description: true,
  code: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  lane: {
    select: {
      id: true,
      title: true,
      code: true,
      floorId: true,
      floor: {
        select: {
          id: true,
          title: true,
          code: true,
          complexId: true,
          complex: {
            select: { id: true, name: true, nameEn: true, isActive: true },
          },
        },
      },
    },
  },
} satisfies Prisma.CommercialUnitSelect;

@Injectable()
export class CommercialUnitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lanes: CommercialLanesService,
  ) {}

  async findAll(
    complexId: string,
    floorId: string,
    laneId: string,
    query: FindCommercialUnitsQueryDto,
  ) {
    await this.lanes.findOne(complexId, floorId, laneId);
    const where: Prisma.CommercialUnitWhereInput = {
      laneId,
      OR: query.q
        ? [
            { plaque: containsInsensitive(query.q) },
            { description: containsInsensitive(query.q) },
            { code: containsInsensitive(query.q) },
          ]
        : undefined,
    };
    const orderBy = resolveSortOrder<Prisma.CommercialUnitOrderByWithRelationInput>(
      query.sortBy,
      query.sortDir,
      {
        plaque: (dir) => ({ plaque: dir }),
        code: (dir) => ({ code: dir }),
        description: (dir) => ({ description: dir }),
        isActive: (dir) => ({ isActive: dir }),
      },
      [{ createdAt: 'desc' }, { id: 'asc' }],
    );
    if (!wantsPagination(query)) {
      return this.prisma.commercialUnit.findMany({
        where,
        orderBy,
        select: unitSelect,
      });
    }
    const { page, pageSize, skip, take } = paginationArgs(query);
    const [items, total] = await Promise.all([
      this.prisma.commercialUnit.findMany({
        where,
        orderBy,
        skip,
        take,
        select: unitSelect,
      }),
      this.prisma.commercialUnit.count({ where }),
    ]);
    return paginatedResult(items, total, page, pageSize);
  }

  async findOne(
    complexId: string,
    floorId: string,
    laneId: string,
    id: string,
  ) {
    await this.lanes.findOne(complexId, floorId, laneId);
    const item = await this.prisma.commercialUnit.findFirst({
      where: { id, laneId },
      select: unitSelect,
    });
    if (!item) {
      throw new NotFoundException('واحد تجاری یافت نشد');
    }
    return item;
  }

  async create(
    complexId: string,
    floorId: string,
    laneId: string,
    dto: CreateCommercialUnitDto,
  ) {
    await this.lanes.findOne(complexId, floorId, laneId);
    const plaque = requiredText(dto.plaque);
    const code = requiredText(dto.code);
    await this.assertPlaqueFree(laneId, plaque);
    try {
      return await this.prisma.commercialUnit.create({
        data: {
          laneId,
          plaque,
          description: optionalText(dto.description) ?? null,
          code,
          isActive: dto.isActive,
        },
        select: unitSelect,
      });
    } catch (error) {
      this.rethrowUnique(error);
    }
  }

  async createSeries(
    complexId: string,
    floorId: string,
    laneId: string,
    dto: CreateCommercialUnitSeriesDto,
  ) {
    await this.lanes.findOne(complexId, floorId, laneId);
    if (dto.to < dto.from) {
      throw new BadRequestException('بازه پلاک معتبر نیست');
    }
    const count = dto.to - dto.from + 1;
    if (count > 200) {
      throw new BadRequestException('حداکثر ۲۰۰ پلاک در هر سری');
    }
    const prefix = optionalText(dto.prefix) ?? '';
    const description = optionalText(dto.description) ?? null;
    const items: Prisma.CommercialUnitCreateManyInput[] = [];
    for (let number = dto.from; number <= dto.to; number += 1) {
      const plaque = `${prefix}${number}`;
      items.push({
        laneId,
        plaque,
        code: plaque,
        description,
        isActive: true,
      });
    }
    const codes = items.map((item) => item.code);
    const plaques = items.map((item) => item.plaque);
    const existing = await this.prisma.commercialUnit.findMany({
      where: {
        laneId,
        OR: [{ code: { in: codes } }, { plaque: { in: plaques } }],
      },
      select: { plaque: true },
    });
    if (existing.length > 0) {
      throw new ConflictException(
        `پلاک تکراری: ${existing.map((item) => item.plaque).join('، ')}`,
      );
    }
    await this.prisma.commercialUnit.createMany({ data: items });
    return { count: items.length };
  }

  async update(
    complexId: string,
    floorId: string,
    laneId: string,
    id: string,
    dto: UpdateCommercialUnitDto,
  ) {
    await this.findOne(complexId, floorId, laneId, id);
    const plaque =
      dto.plaque === undefined ? undefined : requiredText(dto.plaque);
    if (plaque) {
      await this.assertPlaqueFree(laneId, plaque, id);
    }
    try {
      return await this.prisma.commercialUnit.update({
        where: { id },
        data: {
          plaque,
          description: optionalText(dto.description),
          code: dto.code === undefined ? undefined : requiredText(dto.code),
          isActive: dto.isActive,
        },
        select: unitSelect,
      });
    } catch (error) {
      this.rethrowUnique(error);
    }
  }

  async remove(
    complexId: string,
    floorId: string,
    laneId: string,
    id: string,
  ) {
    await this.findOne(complexId, floorId, laneId, id);
    await this.prisma.commercialUnit.delete({ where: { id } });
    return { ok: true };
  }

  private async assertPlaqueFree(
    laneId: string,
    plaque: string,
    exceptId?: string,
  ) {
    const existing = await this.prisma.commercialUnit.findFirst({
      where: {
        laneId,
        plaque,
        ...(exceptId ? { NOT: { id: exceptId } } : {}),
      },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException('پلاک در این لاین تکراری است');
    }
  }

  private rethrowUnique(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException('کد واحد در این لاین تکراری است');
    }
    throw error;
  }
}
