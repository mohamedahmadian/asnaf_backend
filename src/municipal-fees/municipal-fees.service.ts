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
import { CreateMunicipalFeeDto } from './dto/create-municipal-fee.dto';
import { FindMunicipalFeesQueryDto } from './dto/find-municipal-fees-query.dto';
import { UpdateMunicipalFeeDto } from './dto/update-municipal-fee.dto';

const bankAccountSelect = {
  id: true,
  bankName: true,
  accountNumber: true,
  isActive: true,
} satisfies Prisma.BankAccountSelect;

const feeSelect = {
  id: true,
  title: true,
  amount: true,
  bankAccountId: true,
  description: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  bankAccount: { select: bankAccountSelect },
} satisfies Prisma.MunicipalFeeSelect;

function toAmountNumber(value: Prisma.Decimal | number) {
  return typeof value === 'number' ? value : Number(value);
}

function withAmount<T extends { amount: Prisma.Decimal | number }>(item: T) {
  return { ...item, amount: toAmountNumber(item.amount) };
}

@Injectable()
export class MunicipalFeesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: FindMunicipalFeesQueryDto) {
    const where: Prisma.MunicipalFeeWhereInput = {
      bankAccountId: query.bankAccountId,
      isActive: query.isActive,
      OR: this.searchFilter(query.q),
    };
    const orderBy = resolveSortOrder<Prisma.MunicipalFeeOrderByWithRelationInput>(
      query.sortBy,
      query.sortDir,
      {
        title: (dir) => ({ title: dir }),
        amount: (dir) => ({ amount: dir }),
        bankAccount: (dir) => [
          { bankAccount: { bankName: dir } },
          { bankAccount: { accountNumber: dir } },
        ],
        description: (dir) => ({ description: dir }),
        isActive: (dir) => ({ isActive: dir }),
      },
      [{ createdAt: 'desc' }, { id: 'asc' }],
    );
    if (!wantsPagination(query)) {
      const items = await this.prisma.municipalFee.findMany({
        where,
        orderBy,
        select: feeSelect,
      });
      return items.map(withAmount);
    }
    const { page, pageSize, skip, take } = paginationArgs(query);
    const [items, total] = await Promise.all([
      this.prisma.municipalFee.findMany({
        where,
        orderBy,
        skip,
        take,
        select: feeSelect,
      }),
      this.prisma.municipalFee.count({ where }),
    ]);
    return paginatedResult(items.map(withAmount), total, page, pageSize);
  }

  async findOne(id: string) {
    const fee = await this.prisma.municipalFee.findUnique({
      where: { id },
      select: feeSelect,
    });
    if (!fee) {
      throw new NotFoundException('عوارض یافت نشد');
    }
    return withAmount(fee);
  }

  async create(dto: CreateMunicipalFeeDto) {
    await this.assertBankAccount(dto.bankAccountId);
    try {
      return withAmount(
        await this.prisma.municipalFee.create({
          data: this.toData(dto),
          select: feeSelect,
        }),
      );
    } catch (error) {
      this.rethrowUnique(error);
    }
  }

  async update(id: string, dto: UpdateMunicipalFeeDto) {
    await this.findOne(id);
    if (dto.bankAccountId) {
      await this.assertBankAccount(dto.bankAccountId);
    }
    try {
      return withAmount(
        await this.prisma.municipalFee.update({
          where: { id },
          data: this.toData(dto),
          select: feeSelect,
        }),
      );
    } catch (error) {
      this.rethrowUnique(error);
    }
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.municipalFee.delete({ where: { id } });
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

  private searchFilter(q?: string): Prisma.MunicipalFeeWhereInput[] | undefined {
    const term = q?.trim();
    if (!term) {
      return undefined;
    }
    const filters: Prisma.MunicipalFeeWhereInput[] = [
      { title: containsInsensitive(term) },
      { description: containsInsensitive(term) },
      { bankAccount: { bankName: containsInsensitive(term) } },
    ];
    const digits = normalizeSearchDigits(term);
    if (digits) {
      filters.push({
        bankAccount: { accountNumber: containsInsensitive(digits) },
      });
      const asAmount = Number(digits);
      if (Number.isSafeInteger(asAmount)) {
        filters.push({ amount: asAmount });
      }
    }
    return filters;
  }

  private toData(dto: CreateMunicipalFeeDto | UpdateMunicipalFeeDto) {
    return {
      title: dto.title,
      amount:
        dto.amount === undefined ? undefined : new Prisma.Decimal(dto.amount),
      bankAccountId: dto.bankAccountId,
      description: dto.description,
      isActive: dto.isActive,
    };
  }

  private rethrowUnique(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException('این عنوان قبلاً ثبت شده است');
    }
    throw error;
  }
}
