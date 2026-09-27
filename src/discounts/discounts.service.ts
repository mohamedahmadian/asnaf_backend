import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  containsInsensitive,
  normalizeSearchDigits,
  paginatedResult,
  paginationArgs,
  wantsPagination,
} from '../common/pagination';
import { resolveSortOrder } from '../common/sort-query';
import { toLatinDigits } from '../common/national-id';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDiscountDto } from './dto/create-discount.dto';
import { FindDiscountsQueryDto } from './dto/find-discounts-query.dto';
import { UpdateDiscountDto } from './dto/update-discount.dto';

const discountSelect = {
  id: true,
  year: true,
  title: true,
  percent: true,
  description: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.DiscountSelect;

function toPercentNumber(value: Prisma.Decimal | number) {
  return typeof value === 'number' ? value : Number(value);
}

function withPercent<T extends { percent: Prisma.Decimal | number }>(item: T) {
  return { ...item, percent: toPercentNumber(item.percent) };
}

@Injectable()
export class DiscountsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: FindDiscountsQueryDto) {
    const where: Prisma.DiscountWhereInput = {
      year: query.year,
      isActive: query.isActive,
      OR: this.searchFilter(query.q),
    };
    const orderBy = resolveSortOrder<Prisma.DiscountOrderByWithRelationInput>(
      query.sortBy,
      query.sortDir,
      {
        year: (dir) => ({ year: dir }),
        title: (dir) => ({ title: dir }),
        percent: (dir) => ({ percent: dir }),
        isActive: (dir) => ({ isActive: dir }),
      },
      [{ year: 'desc' }, { title: 'asc' }, { id: 'asc' }],
    );
    if (!wantsPagination(query)) {
      const items = await this.prisma.discount.findMany({
        where,
        orderBy,
        select: discountSelect,
      });
      return items.map(withPercent);
    }
    const { page, pageSize, skip, take } = paginationArgs(query);
    const [items, total] = await Promise.all([
      this.prisma.discount.findMany({
        where,
        orderBy,
        skip,
        take,
        select: discountSelect,
      }),
      this.prisma.discount.count({ where }),
    ]);
    return paginatedResult(items.map(withPercent), total, page, pageSize);
  }

  async findOne(id: string) {
    const discount = await this.prisma.discount.findUnique({
      where: { id },
      select: discountSelect,
    });
    if (!discount) {
      throw new NotFoundException('تخفیف یافت نشد');
    }
    return withPercent(discount);
  }

  async create(dto: CreateDiscountDto) {
    try {
      const created = await this.prisma.discount.create({
        data: this.toData(dto),
        select: discountSelect,
      });
      return withPercent(created);
    } catch (error) {
      this.rethrowUnique(error);
    }
  }

  async update(id: string, dto: UpdateDiscountDto) {
    await this.findOne(id);
    try {
      const updated = await this.prisma.discount.update({
        where: { id },
        data: this.toData(dto),
        select: discountSelect,
      });
      return withPercent(updated);
    } catch (error) {
      this.rethrowUnique(error);
    }
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.discount.delete({ where: { id } });
    return { ok: true };
  }

  private searchFilter(q?: string): Prisma.DiscountWhereInput[] | undefined {
    const term = q?.trim();
    if (!term) {
      return undefined;
    }
    const filters: Prisma.DiscountWhereInput[] = [
      { title: containsInsensitive(term) },
      { description: containsInsensitive(term) },
    ];
    const digits = normalizeSearchDigits(term);
    if (digits) {
      const asNumber = Number(digits);
      if (Number.isInteger(asNumber)) {
        filters.push({ year: asNumber });
      }
      const asPercent = Number(toLatinDigits(term).replace(/,/g, '.').replace(/[^\d.]/g, ''));
      if (Number.isFinite(asPercent)) {
        filters.push({ percent: asPercent });
      }
    }
    return filters;
  }

  private toData(dto: CreateDiscountDto | UpdateDiscountDto) {
    return {
      year: dto.year,
      title: dto.title,
      percent:
        dto.percent === undefined ? undefined : new Prisma.Decimal(dto.percent),
      description: dto.description,
      isActive: dto.isActive,
    };
  }

  private rethrowUnique(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException('این عنوان برای این سال قبلاً ثبت شده است');
    }
    throw error;
  }
}
