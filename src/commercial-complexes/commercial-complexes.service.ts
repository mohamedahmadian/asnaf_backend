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
import { CreateCommercialComplexDto } from './dto/create-commercial-complex.dto';
import { FindCommercialComplexesQueryDto } from './dto/find-commercial-complexes-query.dto';
import { optionalText, requiredText } from './dto/text';
import { UpdateCommercialComplexDto } from './dto/update-commercial-complex.dto';

const complexSelect = {
  id: true,
  name: true,
  nameEn: true,
  address: true,
  postalCode: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { floors: true } },
} satisfies Prisma.CommercialComplexSelect;

@Injectable()
export class CommercialComplexesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: FindCommercialComplexesQueryDto) {
    const where: Prisma.CommercialComplexWhereInput = {
      OR: query.q
        ? [
            { name: containsInsensitive(query.q) },
            { nameEn: containsInsensitive(query.q) },
            { address: containsInsensitive(query.q) },
            { postalCode: containsInsensitive(query.q) },
          ]
        : undefined,
    };
    const orderBy = resolveSortOrder<Prisma.CommercialComplexOrderByWithRelationInput>(
      query.sortBy,
      query.sortDir,
      {
        name: (dir) => ({ name: dir }),
        nameEn: (dir) => ({ nameEn: dir }),
        address: (dir) => ({ address: dir }),
        postalCode: (dir) => ({ postalCode: dir }),
        isActive: (dir) => ({ isActive: dir }),
        floorCount: (dir) => ({ floors: { _count: dir } }),
      },
      [{ createdAt: 'desc' }, { id: 'asc' }],
    );
    if (!wantsPagination(query)) {
      return this.prisma.commercialComplex.findMany({
        where,
        orderBy,
        select: complexSelect,
      });
    }
    const { page, pageSize, skip, take } = paginationArgs(query);
    const [items, total] = await Promise.all([
      this.prisma.commercialComplex.findMany({
        where,
        orderBy,
        skip,
        take,
        select: complexSelect,
      }),
      this.prisma.commercialComplex.count({ where }),
    ]);
    return paginatedResult(items, total, page, pageSize);
  }

  async findOne(id: string) {
    const item = await this.prisma.commercialComplex.findUnique({
      where: { id },
      select: complexSelect,
    });
    if (!item) {
      throw new NotFoundException('مجتمع تجاری یافت نشد');
    }
    return item;
  }

  async create(dto: CreateCommercialComplexDto) {
    return this.prisma.commercialComplex.create({
      data: {
        name: requiredText(dto.name),
        nameEn: requiredText(dto.nameEn),
        address: optionalText(dto.address) ?? null,
        postalCode: optionalText(dto.postalCode) ?? null,
        isActive: dto.isActive,
      },
      select: complexSelect,
    });
  }

  async update(id: string, dto: UpdateCommercialComplexDto) {
    await this.findOne(id);
    return this.prisma.commercialComplex.update({
      where: { id },
      data: {
        name: dto.name === undefined ? undefined : requiredText(dto.name),
        nameEn: dto.nameEn === undefined ? undefined : requiredText(dto.nameEn),
        address: optionalText(dto.address),
        postalCode: optionalText(dto.postalCode),
        isActive: dto.isActive,
      },
      select: complexSelect,
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    const floors = await this.prisma.commercialFloor.count({
      where: { complexId: id },
    });
    if (floors > 0) {
      throw new ConflictException('ابتدا طبقات این مجتمع را حذف کنید');
    }
    await this.prisma.commercialComplex.delete({ where: { id } });
    return { ok: true };
  }
}
