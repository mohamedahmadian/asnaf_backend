import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { requestOnCase } from '../cases/request-process';
import { CaseRequestType, PaymentStatus, Prisma } from '../generated/prisma/client';
import { caseSelect, mapCaseFile, mapPayment, money, paymentSelect } from '../payments/payment-records';
import { PrismaService } from '../prisma/prisma.service';
import { SaveCaseRequestFeesDto } from './dto/save-case-request-fees.dto';
import { financialRequestTypes } from '../financial-settings/financial-settings.service';
import { requestFeeStates, requestFeeStatuses } from './request-fee-status';

const payerSelect = {
  id: true,
  personType: true,
  fullName: true,
  nationalId: true,
  phone: true,
  companyName: true,
  companyNationalId: true,
  companyRegistrationNo: true,
} satisfies Prisma.UserSelect;

const financeSelect = {
  requestId: true,
  bankAccount: {
    select: { id: true, bankName: true, accountNumber: true, paymentId: true, isActive: true },
  },
  fees: {
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      municipalFeeId: true,
      title: true,
      amount: true,
      municipalFee: { select: { isActive: true } },
    },
  },
} satisfies Prisma.CaseRequestFinanceSelect;

@Injectable()
export class CaseFinanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async get(caseId: string, requestId?: string) {
    const head = await this.caseHead(caseId);
    const request = await this.request(caseId, requestId);
    return { ...head, ...(await this.requestFinance(request)) };
  }

  /** امور مالی کل پرونده: هزینه‌ها و پرداخت‌های همهٔ درخواست‌های مالی، به تفکیک درخواست */
  async getAll(caseId: string) {
    const head = await this.caseHead(caseId);
    const requests = await this.prisma.caseRequest.findMany({
      where: { caseFileId: caseId, type: { in: [...financialRequestTypes] } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true, number: true, type: true, status: true },
    });
    const items: Awaited<ReturnType<CaseFinanceService['requestFinance']>>[] = [];
    for (const request of requests) {
      items.push(await this.requestFinance(request));
    }
    const sum = (key: keyof (typeof items)[number]['totals']) =>
      items.reduce((total, item) => total + item.totals[key], 0);
    return {
      ...head,
      items,
      totals: {
        total: sum('total'),
        paid: sum('paid'),
        discount: sum('discount'),
        pending: sum('pending'),
        remaining: sum('remaining'),
      },
    };
  }

  private async caseHead(caseId: string) {
    const file = await this.prisma.caseFile.findUnique({
      where: { id: caseId },
      select: { ...caseSelect, user: { select: payerSelect } },
    });
    if (!file) throw new NotFoundException('پرونده یافت نشد');
    const { user, ...caseFile } = file;
    return { caseFile: mapCaseFile(caseFile), payer: user };
  }

  private async requestFinance(request: { id: string; number: string; type: CaseRequestType; status: string }) {
    await this.seed(request.id, request.type);

    const [finance, setting, payments, states] = await Promise.all([
      this.prisma.caseRequestFinance.findUnique({
        where: { requestId: request.id },
        select: financeSelect,
      }),
      this.prisma.financialRequestSetting.findUnique({
        where: { requestType: request.type },
        select: { bankAccountId: true },
      }),
      this.prisma.payment.findMany({
        where: { caseRequestId: request.id },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        select: paymentSelect,
      }),
      requestFeeStates(this.prisma, request.id),
    ]);

    const fees = (finance?.fees ?? []).map((fee) => {
      const state = states.get(fee.municipalFeeId);
      return {
        id: fee.id,
        municipalFeeId: fee.municipalFeeId,
        title: fee.title,
        amount: money(fee.amount),
        isActive: fee.municipalFee.isActive,
        status: state?.status ?? 'UNPAID',
        discount: state?.discount ?? 0,
      };
    });
    const availableFees = finance
      ? await this.prisma.municipalFee.findMany({
          where: {
            bankAccountId: finance.bankAccount.id,
            isActive: true,
            id: { notIn: fees.map((fee) => fee.municipalFeeId) },
          },
          orderBy: [{ title: 'asc' }, { id: 'asc' }],
          select: { id: true, title: true, amount: true },
        })
      : [];
    const paid = payments.filter((item) => !item.deletedAt && item.status === PaymentStatus.PAID);
    const sumFees = (status: string) =>
      fees.filter((fee) => fee.status === status).reduce((sum, fee) => sum + fee.amount, 0);

    return {
      request: {
        id: request.id,
        number: request.number,
        type: request.type,
        status: request.status,
      },
      hasSettings: Boolean(setting),
      settingsAccountChanged: Boolean(
        finance && setting && setting.bankAccountId !== finance.bankAccount.id,
      ),
      finance: finance
        ? {
            bankAccount: finance.bankAccount,
            fees,
            availableFees: availableFees.map((fee) => ({ ...fee, amount: money(fee.amount) })),
          }
        : null,
      payments: payments.map((row) => mapPayment(row, this.config.get<string>('PUBLIC_APP_URL'))),
      totals: {
        total: fees.reduce((sum, fee) => sum + fee.amount, 0),
        paid: paid.reduce((sum, item) => sum + money(item.finalAmount), 0),
        discount: paid.reduce((sum, item) => sum + money(item.discountAmount), 0),
        pending: sumFees('PENDING'),
        remaining: sumFees('UNPAID'),
      },
    };
  }

  async saveFees(caseId: string, requestId: string | undefined, dto: SaveCaseRequestFeesDto) {
    const request = await this.request(caseId, requestId);
    const finance = await this.prisma.caseRequestFinance.findUnique({
      where: { requestId: request.id },
      select: {
        bankAccountId: true,
        fees: { select: { id: true, municipalFeeId: true, amount: true } },
      },
    });
    if (!finance) {
      throw new BadRequestException('حساب و هزینه‌های این نوع درخواست در تنظیمات مالی تعیین نشده است');
    }
    const statuses = await requestFeeStatuses(this.prisma, request.id);
    const nextById = new Map(dto.fees.map((line) => [line.municipalFeeId, line.amount]));
    for (const fee of finance.fees) {
      if ((statuses.get(fee.municipalFeeId) ?? 'UNPAID') === 'UNPAID') continue;
      if (nextById.get(fee.municipalFeeId) !== money(fee.amount)) {
        throw new BadRequestException('هزینهٔ پرداخت‌شده یا در انتظار پرداخت قابل حذف یا تغییر مبلغ نیست');
      }
    }

    const currentIds = new Set(finance.fees.map((fee) => fee.municipalFeeId));
    const addedIds = dto.fees
      .map((line) => line.municipalFeeId)
      .filter((id) => !currentIds.has(id));
    const added = await this.prisma.municipalFee.findMany({
      where: { id: { in: addedIds } },
      select: { id: true, title: true, bankAccountId: true, isActive: true },
    });
    if (added.length !== addedIds.length) {
      throw new NotFoundException('برخی هزینه‌ها یافت نشد');
    }
    if (added.some((fee) => fee.bankAccountId !== finance.bankAccountId)) {
      throw new BadRequestException('هزینه‌ها باید متعلق به حساب بانکی همین درخواست باشند');
    }
    if (added.some((fee) => !fee.isActive)) {
      throw new BadRequestException('هزینه غیرفعال قابل افزودن نیست');
    }
    const titles = new Map(added.map((fee) => [fee.id, fee.title]));

    await this.prisma.$transaction(async (tx) => {
      await tx.caseRequestFee.deleteMany({
        where: { requestId: request.id, municipalFeeId: { notIn: [...nextById.keys()] } },
      });
      for (const [sortOrder, line] of dto.fees.entries()) {
        if (currentIds.has(line.municipalFeeId)) {
          await tx.caseRequestFee.update({
            where: {
              requestId_municipalFeeId: { requestId: request.id, municipalFeeId: line.municipalFeeId },
            },
            data: { amount: line.amount, sortOrder },
          });
        } else {
          await tx.caseRequestFee.create({
            data: {
              requestId: request.id,
              municipalFeeId: line.municipalFeeId,
              title: titles.get(line.municipalFeeId) ?? '',
              amount: line.amount,
              sortOrder,
            },
          });
        }
      }
      await tx.caseRequestFinance.update({
        where: { requestId: request.id },
        data: { updatedAt: new Date() },
      });
    });
    return this.get(caseId, request.id);
  }

  /** حساب و هزینه‌ها را دوباره از تنظیمات مالی می‌سازد؛ فقط وقتی پرداختی روی درخواست نیست. */
  async reset(caseId: string, requestId?: string) {
    const request = await this.request(caseId, requestId);
    const paymentCount = await this.prisma.payment.count({
      where: {
        caseRequestId: request.id,
        deletedAt: null,
        status: { in: [PaymentStatus.PAID, PaymentStatus.PENDING] },
      },
    });
    if (paymentCount > 0) {
      throw new BadRequestException('این درخواست پرداخت دارد و هزینه‌هایش از تنظیمات مالی بازنشانی نمی‌شود');
    }
    const setting = await this.prisma.financialRequestSetting.findUnique({
      where: { requestType: request.type },
      select: { bankAccountId: true },
    });
    if (!setting) {
      throw new BadRequestException('حساب و هزینه‌های این نوع درخواست در تنظیمات مالی تعیین نشده است');
    }
    await this.prisma.caseRequestFinance.deleteMany({ where: { requestId: request.id } });
    await this.seed(request.id, request.type);
    return this.get(caseId, request.id);
  }

  private async request(caseId: string, requestId?: string) {
    const request = await requestOnCase(this.prisma, caseId, requestId);
    if (!request) throw new NotFoundException('درخواست صدور این پرونده هنوز ثبت نشده است');
    return request;
  }

  private async seed(requestId: string, type: CaseRequestType) {
    const existing = await this.prisma.caseRequestFinance.findUnique({
      where: { requestId },
      select: { requestId: true },
    });
    if (existing) return;
    const setting = await this.prisma.financialRequestSetting.findUnique({
      where: { requestType: type },
      select: { bankAccountId: true },
    });
    if (!setting) return;
    const fees = await this.prisma.municipalFee.findMany({
      where: {
        bankAccountId: setting.bankAccountId,
        isActive: true,
        processTypes: { has: type },
      },
      orderBy: [{ title: 'asc' }, { id: 'asc' }],
      select: { id: true, title: true, amount: true },
    });
    try {
      await this.prisma.caseRequestFinance.create({
        data: {
          requestId,
          bankAccountId: setting.bankAccountId,
          fees: {
            create: fees.map((fee, sortOrder) => ({
              municipalFeeId: fee.id,
              title: fee.title,
              amount: fee.amount,
              sortOrder,
            })),
          },
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return;
      throw error;
    }
  }
}
