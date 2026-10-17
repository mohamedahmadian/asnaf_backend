import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CaseRequestType, Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SaveFinancialRequestSettingDto } from './dto/save-financial-request-setting.dto';

export const financialRequestTypes = [
  CaseRequestType.ISSUANCE,
  CaseRequestType.RENEWAL,
  CaseRequestType.LOCATION_CHANGE,
  CaseRequestType.AUCTION,
  CaseRequestType.STEWARDSHIP,
] as const;
export type FinancialRequestType = (typeof financialRequestTypes)[number];

const accountSelect = {
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
  isActive: true,
  processTypes: true,
} satisfies Prisma.MunicipalFeeSelect;

@Injectable()
export class FinancialSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async get() {
    const [accounts, fees, settings] = await Promise.all([
      this.prisma.bankAccount.findMany({
        select: accountSelect,
        orderBy: [{ bankName: 'asc' }, { accountNumber: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.municipalFee.findMany({
        select: feeSelect,
        orderBy: [{ title: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.financialRequestSetting.findMany({
        select: { requestType: true, bankAccountId: true },
      }),
    ]);

    return {
      accounts,
      fees: fees.map((fee) => ({ ...fee, amount: Number(fee.amount) })),
      settings: financialRequestTypes.map((requestType) => {
        const setting = settings.find((item) => item.requestType === requestType);
        return {
          requestType,
          bankAccountId: setting?.bankAccountId ?? null,
          feeIds: fees
            .filter((fee) => fee.processTypes.includes(requestType))
            .map((fee) => fee.id),
        };
      }),
    };
  }

  async save(
    requestType: FinancialRequestType,
    dto: SaveFinancialRequestSettingDto,
  ) {
    await this.prisma.$transaction(async (tx) => {
      const [account, currentSetting, fees] = await Promise.all([
        tx.bankAccount.findUnique({
          where: { id: dto.bankAccountId },
          select: { id: true, isActive: true },
        }),
        tx.financialRequestSetting.findUnique({
          where: { requestType },
          select: { bankAccountId: true },
        }),
        tx.municipalFee.findMany({ select: feeSelect }),
      ]);

      if (!account) throw new NotFoundException('حساب بانکی یافت نشد');
      if (!account.isActive && currentSetting?.bankAccountId !== account.id) {
        throw new BadRequestException('حساب بانکی غیرفعال قابل انتخاب نیست');
      }

      const selectedIds = new Set(dto.feeIds);
      const selectedFees = fees.filter((fee) => selectedIds.has(fee.id));
      if (selectedFees.length !== selectedIds.size) {
        throw new NotFoundException('یکی از هزینه‌های انتخاب‌شده یافت نشد');
      }
      if (selectedFees.some((fee) => fee.bankAccountId !== account.id)) {
        throw new BadRequestException('همه هزینه‌ها باید متعلق به حساب بانکی انتخاب‌شده باشند');
      }
      if (
        selectedFees.some(
          (fee) => !fee.isActive && !fee.processTypes.includes(requestType),
        )
      ) {
        throw new BadRequestException('هزینه غیرفعال قابل افزودن نیست');
      }

      await tx.financialRequestSetting.upsert({
        where: { requestType },
        create: { requestType, bankAccountId: account.id },
        update: { bankAccountId: account.id },
      });

      for (const fee of fees) {
        const included = fee.processTypes.includes(requestType);
        const selected = selectedIds.has(fee.id);
        if (included === selected) continue;
        const processTypes = selected
          ? [...fee.processTypes, requestType]
          : fee.processTypes.filter((item) => item !== requestType);
        await tx.municipalFee.update({
          where: { id: fee.id },
          data: { processTypes: { set: processTypes } },
        });
      }
    });

    return this.get();
  }
}
