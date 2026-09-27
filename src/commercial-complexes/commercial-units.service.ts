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
import { CommercialLanesService } from './commercial-lanes.service';
import { CreateCommercialUnitDto } from './dto/create-commercial-unit.dto';
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
    try {
      return await this.prisma.commercialUnit.create({
        data: {
          laneId,
          plaque: requiredText(dto.plaque),
          description: optionalText(dto.description) ?? null,
          code: requiredText(dto.code),
          isActive: dto.isActive,
        },
        select: unitSelect,
      });
    } catch (error) {
      this.rethrowUnique(error);
    }
  }

  async update(
    complexId: string,
    floorId: string,
    laneId: string,
    id: string,
    dto: UpdateCommercialUnitDto,
  ) {
    await this.findOne(complexId, floorId, laneId, id);
    try {
      return await this.prisma.commercialUnit.update({
        where: { id },
        data: {
          plaque: dto.plaque === undefined ? undefined : requiredText(dto.plaque),
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
