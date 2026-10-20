import {
  BadRequestException,
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
import { CreateBankAccountDto } from './dto/create-bank-account.dto';
import { FindBankAccountsQueryDto } from './dto/find-bank-accounts-query.dto';
import { UpdateBankAccountDto } from './dto/update-bank-account.dto';

const accountSelect = {
  id: true,
  bankName: true,
  accountNumber: true,
  cardNumber: true,
  iban: true,
  paymentId: true,
  description: true,
  isActive: true,
  isDefault: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.BankAccountSelect;

@Injectable()
export class BankAccountsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: FindBankAccountsQueryDto) {
    const where: Prisma.BankAccountWhereInput = {
      isActive: query.isActive,
      OR: this.searchFilter(query.q),
    };
    const orderBy = resolveSortOrder<Prisma.BankAccountOrderByWithRelationInput>(
      query.sortBy,
      query.sortDir,
      {
        bankName: (dir) => ({ bankName: dir }),
        accountNumber: (dir) => ({ accountNumber: dir }),
        cardNumber: (dir) => ({ cardNumber: dir }),
        iban: (dir) => ({ iban: dir }),
        paymentId: (dir) => ({ paymentId: dir }),
        isActive: (dir) => ({ isActive: dir }),
        isDefault: (dir) => ({ isDefault: dir }),
      },
      [{ createdAt: 'desc' }, { id: 'asc' }],
    );
    if (!wantsPagination(query)) {
      return this.prisma.bankAccount.findMany({
        where,
        orderBy,
        select: accountSelect,
      });
    }
    const { page, pageSize, skip, take } = paginationArgs(query);
    const [items, total] = await Promise.all([
      this.prisma.bankAccount.findMany({
        where,
        orderBy,
        skip,
        take,
        select: accountSelect,
      }),
      this.prisma.bankAccount.count({ where }),
    ]);
    return paginatedResult(items, total, page, pageSize);
  }

  async findOne(id: string) {
    const account = await this.prisma.bankAccount.findUnique({
      where: { id },
      select: accountSelect,
    });
    if (!account) {
      throw new NotFoundException('حساب بانکی یافت نشد');
    }
    return account;
  }

  async create(dto: CreateBankAccountDto) {
    const isDefault = this.resolveDefault(dto.isActive ?? true, dto.isDefault);
    try {
      return await this.prisma.$transaction(async (tx) => {
        if (isDefault) {
          await this.clearDefault(tx);
        }
        return tx.bankAccount.create({
          data: { ...this.toData(dto), isDefault },
          select: accountSelect,
        });
      });
    } catch (error) {
      this.rethrowUnique(error);
    }
  }

  async update(id: string, dto: UpdateBankAccountDto) {
    const current = await this.findOne(id);
    const isActive = dto.isActive ?? current.isActive;
    const isDefault = this.resolveDefault(
      isActive,
      dto.isDefault ?? (isActive ? current.isDefault : false),
    );
    try {
      return await this.prisma.$transaction(async (tx) => {
        if (isDefault && !current.isDefault) {
          await this.clearDefault(tx, id);
        }
        return tx.bankAccount.update({
          where: { id },
          data: { ...this.toData(dto), isDefault },
          select: accountSelect,
        });
      });
    } catch (error) {
      this.rethrowUnique(error);
    }
  }

  async setDefault(id: string) {
    const current = await this.findOne(id);
    if (!current.isActive) {
      throw new BadRequestException('حساب بانکی غیرفعال نمی‌تواند پیش‌فرض باشد');
    }
    if (current.isDefault) {
      return current;
    }
    return this.prisma.$transaction(async (tx) => {
      await this.clearDefault(tx, id);
      return tx.bankAccount.update({
        where: { id },
        data: { isDefault: true },
        select: accountSelect,
      });
    });
  }

  private resolveDefault(isActive: boolean, isDefault?: boolean) {
    if (isDefault && !isActive) {
      throw new BadRequestException('حساب بانکی غیرفعال نمی‌تواند پیش‌فرض باشد');
    }
    return Boolean(isDefault);
  }

  private clearDefault(tx: Prisma.TransactionClient, exceptId?: string) {
    return tx.bankAccount.updateMany({
      where: { isDefault: true, ...(exceptId ? { id: { not: exceptId } } : {}) },
      data: { isDefault: false },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    try {
      await this.prisma.bankAccount.delete({ where: { id } });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003'
      ) {
        throw new ConflictException(
          'این حساب بانکی در اطلاعات مالی استفاده شده و قابل حذف نیست',
        );
      }
      throw error;
    }
    return { ok: true };
  }

  private searchFilter(q?: string): Prisma.BankAccountWhereInput[] | undefined {
    const term = q?.trim();
    if (!term) {
      return undefined;
    }
    const digits = normalizeSearchDigits(term);
    const ibanTerm = toLatinDigits(term).replace(/[\s-]/g, '').toUpperCase();
    const filters: Prisma.BankAccountWhereInput[] = [
      { bankName: containsInsensitive(term) },
      { description: containsInsensitive(term) },
    ];
    if (digits) {
      filters.push(
        { accountNumber: containsInsensitive(digits) },
        { cardNumber: containsInsensitive(digits) },
        { paymentId: containsInsensitive(digits) },
      );
    }
    if (ibanTerm) {
      filters.push({ iban: containsInsensitive(ibanTerm) });
    }
    return filters;
  }

  private toData(dto: CreateBankAccountDto | UpdateBankAccountDto) {
    return {
      bankName: dto.bankName,
      accountNumber: dto.accountNumber,
      cardNumber: dto.cardNumber,
      iban: dto.iban,
      paymentId: dto.paymentId,
      description: dto.description,
      isActive: dto.isActive,
    };
  }

  private rethrowUnique(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException(this.uniqueMessage(error));
    }
    throw error;
  }

  private uniqueMessage(error: Prisma.PrismaClientKnownRequestError) {
    const target = error.meta?.target;
    const fields = Array.isArray(target)
      ? target.map(String).join(' ')
      : String(target ?? '');
    if (fields.includes('cardNumber')) {
      return 'این شماره کارت قبلاً ثبت شده است';
    }
    if (fields.includes('iban')) {
      return 'این شماره شبا قبلاً ثبت شده است';
    }
    if (fields.includes('paymentId')) {
      return 'این شناسه پرداخت قبلاً ثبت شده است';
    }
    if (fields.includes('accountNumber') || fields.includes('bankName')) {
      return 'این شماره حساب برای این بانک قبلاً ثبت شده است';
    }
    return 'این حساب بانکی قبلاً ثبت شده است';
  }
}
