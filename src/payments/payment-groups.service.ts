import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SavePaymentGroupDto } from './dto/save-payment-group.dto';

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
  isActive: true,
  bankAccountId: true,
} satisfies Prisma.MunicipalFeeSelect;

function toAmountNumber(value: Prisma.Decimal | number) {
  return typeof value === 'number' ? value : Number(value);
}

@Injectable()
export class PaymentGroupsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    const items = await this.prisma.paymentGroup.findMany({
      orderBy: [{ title: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        title: true,
        bankAccountId: true,
        createdAt: true,
        updatedAt: true,
        bankAccount: { select: bankAccountSelect },
        items: {
          orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
          select: {
            sortOrder: true,
            municipalFee: { select: feeSelect },
          },
        },
      },
    });
    return items.map((group) => this.mapGroup(group));
  }

  async create(dto: SavePaymentGroupDto) {
    await this.assertBankAccount(dto.bankAccountId);
    await this.assertFees(dto.bankAccountId, dto.feeIds);
    const group = await this.prisma.paymentGroup.create({
      data: {
        title: dto.title,
        bankAccountId: dto.bankAccountId,
        items: {
          create: dto.feeIds.map((municipalFeeId, sortOrder) => ({
            municipalFeeId,
            sortOrder,
          })),
        },
      },
      select: { id: true },
    });
    return this.findOne(group.id);
  }

  async update(id: string, dto: SavePaymentGroupDto) {
    await this.findOne(id);
    await this.assertBankAccount(dto.bankAccountId);
    await this.assertFees(dto.bankAccountId, dto.feeIds);
    await this.prisma.$transaction(async (tx) => {
      await tx.paymentGroup.update({
        where: { id },
        data: { title: dto.title, bankAccountId: dto.bankAccountId },
      });
      await tx.paymentGroupItem.deleteMany({ where: { paymentGroupId: id } });
      await tx.paymentGroupItem.createMany({
        data: dto.feeIds.map((municipalFeeId, sortOrder) => ({
          paymentGroupId: id,
          municipalFeeId,
          sortOrder,
        })),
      });
    });
    return this.findOne(id);
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.paymentGroup.delete({ where: { id } });
    return { ok: true };
  }

  private async findOne(id: string) {
    const group = await this.prisma.paymentGroup.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        bankAccountId: true,
        createdAt: true,
        updatedAt: true,
        bankAccount: { select: bankAccountSelect },
        items: {
          orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
          select: {
            sortOrder: true,
            municipalFee: { select: feeSelect },
          },
        },
      },
    });
    if (!group) {
      throw new NotFoundException('گروه پرداخت یافت نشد');
    }
    return this.mapGroup(group);
  }

  private mapGroup(group: {
    id: string;
    title: string;
    bankAccountId: string;
    createdAt: Date;
    updatedAt: Date;
    bankAccount: {
      id: string;
      bankName: string;
      accountNumber: string;
      isActive: boolean;
    };
    items: {
      sortOrder: number;
      municipalFee: {
        id: string;
        title: string;
        amount: Prisma.Decimal | number;
        isActive: boolean;
        bankAccountId: string;
      };
    }[];
  }) {
    return {
      id: group.id,
      title: group.title,
      bankAccountId: group.bankAccountId,
      createdAt: group.createdAt,
      updatedAt: group.updatedAt,
      bankAccount: group.bankAccount,
      fees: group.items.map((item) => ({
        id: item.municipalFee.id,
        title: item.municipalFee.title,
        amount: toAmountNumber(item.municipalFee.amount),
        isActive: item.municipalFee.isActive,
        bankAccountId: item.municipalFee.bankAccountId,
      })),
    };
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

  private async assertFees(bankAccountId: string, feeIds: string[]) {
    const fees = await this.prisma.municipalFee.findMany({
      where: { id: { in: feeIds }, bankAccountId },
      select: { id: true },
    });
    if (fees.length !== feeIds.length) {
      throw new BadRequestException('برخی هزینه‌ها به این حساب تعلق ندارند');
    }
  }
}
