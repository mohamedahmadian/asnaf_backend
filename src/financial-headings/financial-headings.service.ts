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
import { CreateFinancialHeadingDto } from './dto/create-financial-heading.dto';
import { FindFinancialHeadingsQueryDto } from './dto/find-financial-headings-query.dto';
import { UpdateFinancialHeadingDto } from './dto/update-financial-heading.dto';

const bankAccountSelect = {
  id: true,
  bankName: true,
  accountNumber: true,
  isActive: true,
} satisfies Prisma.BankAccountSelect;

const financialHeadingSelect = {
  id: true,
  title: true,
  description: true,
  bankAccountId: true,
  paymentId: true,
  createdAt: true,
  updatedAt: true,
  bankAccount: { select: bankAccountSelect },
} satisfies Prisma.FinancialHeadingSelect;

@Injectable()
export class FinancialHeadingsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: FindFinancialHeadingsQueryDto) {
    const where: Prisma.FinancialHeadingWhereInput = {
      bankAccountId: query.bankAccountId,
      OR: this.searchFilter(query.q),
    };
    const orderBy =
      resolveSortOrder<Prisma.FinancialHeadingOrderByWithRelationInput>(
        query.sortBy,
        query.sortDir,
        {
          title: (dir) => ({ title: dir }),
          description: (dir) => ({ description: dir }),
          bankAccount: (dir) => [
            { bankAccount: { bankName: dir } },
            { bankAccount: { accountNumber: dir } },
          ],
          paymentId: (dir) => ({ paymentId: dir }),
        },
        [{ createdAt: 'desc' }, { id: 'asc' }],
      );

    if (!wantsPagination(query)) {
      return this.prisma.financialHeading.findMany({
        where,
        orderBy,
        select: financialHeadingSelect,
      });
    }

    const { page, pageSize, skip, take } = paginationArgs(query);
    const [items, total] = await Promise.all([
      this.prisma.financialHeading.findMany({
        where,
        orderBy,
        skip,
        take,
        select: financialHeadingSelect,
      }),
      this.prisma.financialHeading.count({ where }),
    ]);
    return paginatedResult(items, total, page, pageSize);
  }

  async findOne(id: string) {
    const item = await this.prisma.financialHeading.findUnique({
      where: { id },
      select: financialHeadingSelect,
    });
    if (!item) {
      throw new NotFoundException('سرفصل مالی یافت نشد');
    }
    return item;
  }

  async create(dto: CreateFinancialHeadingDto) {
    await this.assertBankAccount(dto.bankAccountId);
    try {
      return await this.prisma.financialHeading.create({
        data: dto,
        select: financialHeadingSelect,
      });
    } catch (error) {
      this.rethrowUnique(error);
    }
  }

  async update(id: string, dto: UpdateFinancialHeadingDto) {
    await this.findOne(id);
    if (dto.bankAccountId) {
      await this.assertBankAccount(dto.bankAccountId);
    }
    try {
      return await this.prisma.financialHeading.update({
        where: { id },
        data: dto,
        select: financialHeadingSelect,
      });
    } catch (error) {
      this.rethrowUnique(error);
    }
  }

  async remove(id: string) {
    await this.findOne(id);
    try {
      await this.prisma.financialHeading.delete({ where: { id } });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003'
      ) {
        throw new ConflictException(
          'این سرفصل مالی دارای هزینه است و قابل حذف نیست',
        );
      }
      throw error;
    }
    return { ok: true };
  }

  private async assertBankAccount(id: string) {
    const account = await this.prisma.bankAccount.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!account) {
      throw new NotFoundException('حساب بانکی یافت نشد');
    }
  }

  private searchFilter(
    q?: string,
  ): Prisma.FinancialHeadingWhereInput[] | undefined {
    const term = q?.trim();
    if (!term) {
      return undefined;
    }
    const filters: Prisma.FinancialHeadingWhereInput[] = [
      { title: containsInsensitive(term) },
      { description: containsInsensitive(term) },
      { bankAccount: { bankName: containsInsensitive(term) } },
    ];
    const digits = normalizeSearchDigits(term);
    if (digits) {
      filters.push(
        { paymentId: containsInsensitive(digits) },
        { bankAccount: { accountNumber: containsInsensitive(digits) } },
      );
    }
    return filters;
  }

  private rethrowUnique(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      const target = String(error.meta?.target ?? '');
      throw new ConflictException(
        target.includes('paymentId')
          ? 'این شناسه پرداخت قبلاً ثبت شده است'
          : 'این عنوان قبلاً ثبت شده است',
      );
    }
    throw error;
  }
}
