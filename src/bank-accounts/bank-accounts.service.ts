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
import { CreateBankAccountDto } from './dto/create-bank-account.dto';
import { FindBankAccountsQueryDto } from './dto/find-bank-accounts-query.dto';
import { UpdateBankAccountDto } from './dto/update-bank-account.dto';

const accountSelect = {
  id: true,
  bankName: true,
  accountNumber: true,
  cardNumber: true,
  iban: true,
  description: true,
  isActive: true,
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
        isActive: (dir) => ({ isActive: dir }),
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
    try {
      return await this.prisma.bankAccount.create({
        data: this.toData(dto),
        select: accountSelect,
      });
    } catch (error) {
      this.rethrowUnique(error);
    }
  }

  async update(id: string, dto: UpdateBankAccountDto) {
    await this.findOne(id);
    try {
      return await this.prisma.bankAccount.update({
        where: { id },
        data: this.toData(dto),
        select: accountSelect,
      });
    } catch (error) {
      this.rethrowUnique(error);
    }
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
          'این حساب بانکی در عوارض استفاده شده و قابل حذف نیست',
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
    if (fields.includes('accountNumber') || fields.includes('bankName')) {
      return 'این شماره حساب برای این بانک قبلاً ثبت شده است';
    }
    return 'این حساب بانکی قبلاً ثبت شده است';
  }
}
