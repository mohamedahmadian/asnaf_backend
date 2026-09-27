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
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInquiryCenterDto } from './dto/create-inquiry-center.dto';
import { FindInquiryCentersQueryDto } from './dto/find-inquiry-centers-query.dto';
import { UpdateInquiryCenterDto } from './dto/update-inquiry-center.dto';

const officerSelect = {
  id: true,
  fullName: true,
  firstName: true,
  lastName: true,
} satisfies Prisma.UserSelect;

const centerSelect = {
  id: true,
  name: true,
  description: true,
  phone: true,
  officerId: true,
  letterTitle: true,
  letterBody: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  officer: { select: officerSelect },
} satisfies Prisma.InquiryCenterSelect;

@Injectable()
export class InquiryCentersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: FindInquiryCentersQueryDto) {
    const where: Prisma.InquiryCenterWhereInput = {
      isActive: query.isActive,
      OR: this.searchFilter(query.q),
    };
    const orderBy =
      resolveSortOrder<Prisma.InquiryCenterOrderByWithRelationInput>(
        query.sortBy,
        query.sortDir,
        {
          name: (dir) => ({ name: dir }),
          phone: (dir) => ({ phone: dir }),
          officer: (dir) => ({ officer: { fullName: dir } }),
          letterTitle: (dir) => ({ letterTitle: dir }),
          isActive: (dir) => ({ isActive: dir }),
        },
        [{ createdAt: 'desc' }, { id: 'asc' }],
      );
    if (!wantsPagination(query)) {
      return this.prisma.inquiryCenter.findMany({
        where,
        orderBy,
        select: centerSelect,
      });
    }
    const { page, pageSize, skip, take } = paginationArgs(query);
    const [items, total] = await Promise.all([
      this.prisma.inquiryCenter.findMany({
        where,
        orderBy,
        skip,
        take,
        select: centerSelect,
      }),
      this.prisma.inquiryCenter.count({ where }),
    ]);
    return paginatedResult(items, total, page, pageSize);
  }

  async findOne(id: string) {
    const item = await this.prisma.inquiryCenter.findUnique({
      where: { id },
      select: centerSelect,
    });
    if (!item) {
      throw new NotFoundException('مرکز استعلام یافت نشد');
    }
    return item;
  }

  async create(dto: CreateInquiryCenterDto) {
    await this.assertOfficer(dto.officerId);
    try {
      return await this.prisma.inquiryCenter.create({
        data: this.toData(dto),
        select: centerSelect,
      });
    } catch (error) {
      this.rethrowUnique(error);
    }
  }

  async update(id: string, dto: UpdateInquiryCenterDto) {
    await this.findOne(id);
    await this.assertOfficer(dto.officerId);
    try {
      return await this.prisma.inquiryCenter.update({
        where: { id },
        data: this.toData(dto),
        select: centerSelect,
      });
    } catch (error) {
      this.rethrowUnique(error);
    }
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.inquiryCenter.delete({ where: { id } });
    return { ok: true };
  }

  private searchFilter(
    q?: string,
  ): Prisma.InquiryCenterWhereInput[] | undefined {
    const term = q?.trim();
    if (!term) {
      return undefined;
    }
    const digits = normalizeSearchDigits(term);
    const filters: Prisma.InquiryCenterWhereInput[] = [
      { name: containsInsensitive(term) },
      { description: containsInsensitive(term) },
      { letterTitle: containsInsensitive(term) },
      { letterBody: containsInsensitive(term) },
      { officer: { is: { fullName: containsInsensitive(term) } } },
    ];
    if (digits) {
      filters.push({ phone: containsInsensitive(digits) });
    }
    return filters;
  }

  private toData(dto: CreateInquiryCenterDto | UpdateInquiryCenterDto) {
    return {
      name: dto.name,
      description: dto.description,
      phone: dto.phone,
      officerId: dto.officerId,
      letterTitle: dto.letterTitle,
      letterBody: dto.letterBody,
      isActive: dto.isActive,
    };
  }

  private async assertOfficer(officerId?: string | null) {
    if (!officerId) {
      return;
    }
    const user = await this.prisma.user.findUnique({
      where: { id: officerId },
      select: { id: true },
    });
    if (!user) {
      throw new NotFoundException('مسئول مربوطه یافت نشد');
    }
  }

  private rethrowUnique(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException('این مرکز استعلام قبلاً ثبت شده است');
    }
    throw error;
  }
}
