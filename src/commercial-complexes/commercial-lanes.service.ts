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
import { CommercialFloorsService } from './commercial-floors.service';
import { CreateCommercialLaneDto } from './dto/create-commercial-lane.dto';
import { FindCommercialLanesQueryDto } from './dto/find-commercial-lanes-query.dto';
import { optionalText, requiredText } from './dto/text';
import { UpdateCommercialLaneDto } from './dto/update-commercial-lane.dto';

const laneSelect = {
  id: true,
  floorId: true,
  title: true,
  description: true,
  code: true,
  createdAt: true,
  updatedAt: true,
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
  _count: { select: { units: true } },
} satisfies Prisma.CommercialLaneSelect;

@Injectable()
export class CommercialLanesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly floors: CommercialFloorsService,
  ) {}

  async findAll(
    complexId: string,
    floorId: string,
    query: FindCommercialLanesQueryDto,
  ) {
    await this.floors.findOne(complexId, floorId);
    const where: Prisma.CommercialLaneWhereInput = {
      floorId,
      OR: query.q
        ? [
            { title: containsInsensitive(query.q) },
            { description: containsInsensitive(query.q) },
            { code: containsInsensitive(query.q) },
          ]
        : undefined,
    };
    const orderBy = resolveSortOrder<Prisma.CommercialLaneOrderByWithRelationInput>(
      query.sortBy,
      query.sortDir,
      {
        title: (dir) => ({ title: dir }),
        code: (dir) => ({ code: dir }),
        description: (dir) => ({ description: dir }),
        unitCount: (dir) => ({ units: { _count: dir } }),
      },
      [{ createdAt: 'desc' }, { id: 'asc' }],
    );
    if (!wantsPagination(query)) {
      return this.prisma.commercialLane.findMany({
        where,
        orderBy,
        select: laneSelect,
      });
    }
    const { page, pageSize, skip, take } = paginationArgs(query);
    const [items, total] = await Promise.all([
      this.prisma.commercialLane.findMany({
        where,
        orderBy,
        skip,
        take,
        select: laneSelect,
      }),
      this.prisma.commercialLane.count({ where }),
    ]);
    return paginatedResult(items, total, page, pageSize);
  }

  async findOne(complexId: string, floorId: string, id: string) {
    await this.floors.findOne(complexId, floorId);
    const item = await this.prisma.commercialLane.findFirst({
      where: { id, floorId },
      select: laneSelect,
    });
    if (!item) {
      throw new NotFoundException('لاین یافت نشد');
    }
    return item;
  }

  async create(
    complexId: string,
    floorId: string,
    dto: CreateCommercialLaneDto,
  ) {
    await this.floors.findOne(complexId, floorId);
    try {
      return await this.prisma.commercialLane.create({
        data: {
          floorId,
          title: requiredText(dto.title),
          description: optionalText(dto.description) ?? null,
          code: requiredText(dto.code),
        },
        select: laneSelect,
      });
    } catch (error) {
      this.rethrowUnique(error);
    }
  }

  async update(
    complexId: string,
    floorId: string,
    id: string,
    dto: UpdateCommercialLaneDto,
  ) {
    await this.findOne(complexId, floorId, id);
    try {
      return await this.prisma.commercialLane.update({
        where: { id },
        data: {
          title: dto.title === undefined ? undefined : requiredText(dto.title),
          description: optionalText(dto.description),
          code: dto.code === undefined ? undefined : requiredText(dto.code),
        },
        select: laneSelect,
      });
    } catch (error) {
      this.rethrowUnique(error);
    }
  }

  async remove(complexId: string, floorId: string, id: string) {
    await this.findOne(complexId, floorId, id);
    const units = await this.prisma.commercialUnit.count({
      where: { laneId: id },
    });
    if (units > 0) {
      throw new ConflictException('ابتدا واحدهای این لاین را حذف کنید');
    }
    await this.prisma.commercialLane.delete({ where: { id } });
    return { ok: true };
  }

  private rethrowUnique(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException('کد لاین در این طبقه تکراری است');
    }
    throw error;
  }
}
