import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  containsInsensitive,
  normalizeSearchDigits,
  paginatedResult,
  paginationArgs,
} from '../common/pagination';
import { normalizeMobile } from '../common/phone';
import { resolveSortOrder } from '../common/sort-query';
import { PersonType, Prisma } from '../generated/prisma/client';
import { requestFeeStatuses } from '../case-finance/request-fee-status';
import { ImagesService } from '../images/images.service';
import { PrismaService } from '../prisma/prisma.service';
import { parseDateOnly } from '../violations/calendar';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { FindPaymentsQueryDto } from './dto/find-payments-query.dto';
import { PaymentOnlineService } from './payment-online.service';
import {
  caseSelect,
  mapCaseFile,
  mapPayment,
  money,
  nextReceiptNumber,
  paymentSelect,
} from './payment-records';

const TEHRAN_OFFSET_MS = (3 * 60 + 30) * 60 * 1000;
/** حداقل مبلغ قابل پرداخت در درگاه شاپرک (ریال) */
const MIN_ONLINE_AMOUNT = 1000;

const receiptSelect = {
  id: true,
  imageId: true,
  originalName: true,
  createdAt: true,
  uploadedBy: { select: { id: true, fullName: true } },
} satisfies Prisma.PaymentReceiptSelect;

type ReceiptUpload = {
  buffer: Buffer;
  size: number;
  mimetype: string;
  originalname: string;
};

const MAX_RECEIPTS = 10;

function tehranDayStart(isoDate: string) {
  const parsed = parseDateOnly(isoDate);
  if (!parsed) return null;
  return new Date(parsed.getTime() - TEHRAN_OFFSET_MS);
}

function decodeFileName(name: string) {
  const raw = (name || 'receipt').trim() || 'receipt';
  const utf8 = Buffer.from(raw, 'latin1').toString('utf8');
  if (utf8.includes('\uFFFD')) return raw.slice(0, 255);
  return utf8.slice(0, 255);
}

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly images: ImagesService,
    private readonly online: PaymentOnlineService,
    private readonly config: ConfigService,
  ) {}

  private get appUrl() {
    return this.config.get<string>('PUBLIC_APP_URL');
  }

  async searchParties(raw: string) {
    const term = raw.trim();
    if (term.length < 2) return [];
    const digits = normalizeSearchDigits(term);
    const mobile = digits ? normalizeMobile(term) : '';
    const people = await this.prisma.user.findMany({
      where: {
        OR: [
          { fullName: containsInsensitive(term) },
          { firstName: containsInsensitive(term) },
          { lastName: containsInsensitive(term) },
          { companyName: containsInsensitive(term) },
          { companyRegistrationNo: containsInsensitive(term) },
          { caseFiles: { some: { businessUnitTitle: containsInsensitive(term) } } },
          { caseFiles: { some: { licenseNumber: containsInsensitive(term) } } },
          ...(digits
            ? [
                { nationalId: { contains: digits } },
                { phone: { contains: digits } },
                { companyNationalId: { contains: digits } },
                { companyRegistrationNo: { contains: digits } },
              ]
            : []),
          ...(mobile && mobile !== digits ? [{ phone: { contains: mobile } }] : []),
        ],
      },
      orderBy: [{ fullName: 'asc' }, { id: 'asc' }],
      take: 12,
      select: {
        id: true,
        personType: true,
        fullName: true,
        nationalId: true,
        phone: true,
        companyName: true,
        companyNationalId: true,
        companyRegistrationNo: true,
        caseFiles: {
          orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
          select: {
            ...caseSelect,
            requests: {
              orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
              select: { id: true, number: true, type: true, status: true },
            },
          },
        },
      },
    });
    return people.map((person) => ({
      id: person.id,
      personType: person.personType,
      fullName: person.fullName,
      nationalId: person.nationalId,
      phone: person.phone,
      companyName: person.companyName,
      companyNationalId: person.companyNationalId,
      companyRegistrationNo: person.companyRegistrationNo,
      cases:
        person.personType === PersonType.LEGAL
          ? []
          : person.caseFiles.map(({ requests, ...file }) => ({
              ...mapCaseFile(file),
              requests,
            })),
    }));
  }

  async create(dto: CreatePaymentDto, actorId?: string) {
    if (!actorId) {
      throw new UnauthorizedException();
    }
    const actor = await this.prisma.user.findUnique({
      where: { id: actorId },
      select: { id: true },
    });
    if (!actor) {
      throw new UnauthorizedException();
    }

    const payer = await this.prisma.user.findUnique({
      where: { id: dto.payerUserId },
      select: {
        id: true,
        personType: true,
        fullName: true,
        nationalId: true,
        phone: true,
        companyName: true,
        companyNationalId: true,
        companyRegistrationNo: true,
      },
    });
    if (!payer) {
      throw new NotFoundException('پرداخت‌کننده یافت نشد');
    }
    const caseFileId =
      payer.personType === PersonType.LEGAL ? null : (dto.caseFileId ?? null);
    if (caseFileId) {
      const owned = await this.prisma.caseFile.findFirst({
        where: { id: caseFileId, userId: payer.id },
        select: { id: true },
      });
      if (!owned) {
        throw new BadRequestException('این مجوز به پرداخت‌کننده تعلق ندارد');
      }
    }
    const caseRequestId = caseFileId ? (dto.caseRequestId ?? null) : null;
    if (caseRequestId) {
      const request = await this.prisma.caseRequest.findFirst({
        where: { id: caseRequestId, caseFileId: caseFileId ?? undefined },
        select: { id: true },
      });
      if (!request) {
        throw new BadRequestException('درخواست انتخاب‌شده به این پرونده تعلق ندارد');
      }
    }
    const payerName =
      payer.personType === PersonType.LEGAL
        ? payer.companyName?.trim() || payer.fullName
        : payer.fullName;

    const included = dto.lines.filter((line) => line.included);
    if (included.length === 0) {
      throw new BadRequestException('حداقل یک هزینه را در مجموع بیاورید');
    }
    const feeIds = included.map((line) => line.municipalFeeId);
    if (new Set(feeIds).size !== feeIds.length) {
      throw new BadRequestException('هزینه تکراری در پرداخت است');
    }

    const source = await this.resolveSource(dto.paymentGroupId ?? null, dto.bankAccountId);
    if (caseRequestId) {
      const requestFees = await this.prisma.caseRequestFee.findMany({
        where: { requestId: caseRequestId, finance: { bankAccountId: source.bankAccountId } },
        select: { municipalFeeId: true },
      });
      for (const fee of requestFees) source.allowedFeeIds.add(fee.municipalFeeId);
      const statuses = await requestFeeStatuses(this.prisma, caseRequestId);
      if (feeIds.some((feeId) => statuses.has(feeId))) {
        throw new BadRequestException('برخی هزینه‌ها برای این درخواست قبلاً پرداخت شده یا در انتظار پرداخت است');
      }
    }
    for (const feeId of feeIds) {
      if (!source.allowedFeeIds.has(feeId)) {
        throw new BadRequestException('هزینه در این پرداخت مجاز نیست');
      }
    }

    const fees = await this.prisma.municipalFee.findMany({
      where: { id: { in: feeIds } },
      select: { id: true, title: true },
    });
    const titles = new Map(fees.map((fee) => [fee.id, fee.title]));
    if (titles.size !== feeIds.length) {
      throw new BadRequestException('برخی هزینه‌ها یافت نشد');
    }

    const subtotal = included.reduce((sum, line) => sum + line.amount, 0);
    if (dto.discountAmount > subtotal) {
      throw new BadRequestException('مبلغ تخفیف از مجموع هزینه‌ها بیشتر است');
    }

    const discount = await this.resolveDiscount(dto);
    const finalAmount = subtotal - dto.discountAmount;

    const isOnline = dto.method === 'ONLINE';
    if (!isOnline && finalAmount > 0 && !dto.trackingCode) {
      throw new BadRequestException(
        dto.method === 'POS' ? 'شماره پیگیری کارت‌خوان را وارد کنید' : 'شماره فیش بانکی را وارد کنید',
      );
    }
    if (isOnline && finalAmount < MIN_ONLINE_AMOUNT) {
      throw new BadRequestException('مبلغ پرداخت آنلاین باید حداقل ۱٬۰۰۰ ریال باشد');
    }
    const usesLink = isOnline && dto.onlineChannel === 'PUBLIC_LINK';
    if (usesLink && !payer.phone) {
      throw new BadRequestException('برای ارسال لینک پرداخت، تلفن همراه پرداخت‌کننده ثبت نشده است');
    }
    const link = usesLink ? this.online.newPayLink() : null;

    const created = await this.prisma.payment.create({
      data: {
        caseFileId,
        caseRequestId,
        payerUserId: payer.id,
        personType: payer.personType,
        nationalId: payer.personType === PersonType.LEGAL ? null : payer.nationalId,
        companyName: payer.personType === PersonType.LEGAL ? payer.companyName : null,
        companyNationalId: payer.personType === PersonType.LEGAL ? payer.companyNationalId : null,
        companyRegistrationNo:
          payer.personType === PersonType.LEGAL ? payer.companyRegistrationNo : null,
        payerName,
        recordedById: actor.id,
        description: dto.description ?? null,
        paymentGroupId: source.paymentGroupId,
        paymentGroupTitle: source.paymentGroupTitle,
        bankAccountId: source.bankAccountId,
        discountMode: dto.discountMode,
        discountId: discount.id,
        discountTitle: discount.title,
        discountPercent: discount.percent,
        feeCount: included.length,
        subtotal,
        discountAmount: dto.discountAmount,
        finalAmount,
        method: dto.method,
        status: isOnline ? 'PENDING' : 'PAID',
        trackingCode: isOnline ? null : (dto.trackingCode ?? null),
        receiptNumber: await nextReceiptNumber(this.prisma),
        payLinkToken: link?.token ?? null,
        payLinkExpiresAt: link?.expiresAt ?? null,
        lines: {
          create: included.map((line, sortOrder) => ({
            municipalFeeId: line.municipalFeeId,
            title: titles.get(line.municipalFeeId) ?? '',
            amount: line.amount,
            sortOrder,
          })),
        },
      },
      select: { id: true },
    });

    const sms = usesLink ? await this.online.sendPayLink(created.id) : null;
    return { ...(await this.findOne(created.id)), sms };
  }

  async findHistory(query: FindPaymentsQueryDto) {
    const where = await this.historyWhere(query);
    const orderBy = resolveSortOrder<Prisma.PaymentOrderByWithRelationInput>(
      query.sortBy,
      query.sortDir,
      {
        paidAt: (dir) => ({ paidAt: dir }),
        recordedBy: (dir) => ({ recordedBy: { fullName: dir } }),
        nationalId: (dir) => ({ nationalId: dir }),
        payerName: (dir) => ({ payerName: dir }),
        caseFile: (dir) => [
          { caseFile: { licenseNumber: dir } },
          { caseFile: { cardNumber: dir } },
          { caseFile: { trackingCode: dir } },
        ],
        feeCount: (dir) => ({ feeCount: dir }),
        subtotal: (dir) => ({ subtotal: dir }),
        discountAmount: (dir) => ({ discountAmount: dir }),
        finalAmount: (dir) => ({ finalAmount: dir }),
        receiptCount: (dir) => ({ receipts: { _count: dir } }),
        receiptNumber: (dir) => ({ receiptNumber: dir }),
        method: (dir) => ({ method: dir }),
        status: (dir) => ({ status: dir }),
      },
      [{ paidAt: 'desc' }, { id: 'asc' }],
    );
    const { page, pageSize, skip, take } = paginationArgs(query);
    const [items, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        orderBy,
        skip,
        take,
        select: paymentSelect,
      }),
      this.prisma.payment.count({ where }),
    ]);
    return paginatedResult(
      items.map((row) => mapPayment(row, this.appUrl)),
      total,
      page,
      pageSize,
    );
  }

  async findOne(id: string) {
    const row = await this.prisma.payment.findUnique({
      where: { id },
      select: {
        ...paymentSelect,
        lines: {
          orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
          select: {
            id: true,
            municipalFeeId: true,
            title: true,
            amount: true,
            sortOrder: true,
          },
        },
        receipts: {
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          select: receiptSelect,
        },
        gatewayTransactions: {
          orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
          take: 20,
          select: {
            id: true,
            gateway: true,
            channel: true,
            orderId: true,
            amount: true,
            status: true,
            resCode: true,
            saleReferenceId: true,
            cardHolderPan: true,
            createdAt: true,
            verifiedAt: true,
            settledAt: true,
          },
        },
      },
    });
    if (!row) {
      throw new NotFoundException('پرداخت یافت نشد');
    }
    const { lines, receipts, gatewayTransactions, ...payment } = row;
    return {
      ...mapPayment(payment, this.appUrl),
      lines: lines.map((line) => ({
        id: line.id,
        municipalFeeId: line.municipalFeeId,
        title: line.title,
        amount: money(line.amount),
        sortOrder: line.sortOrder,
      })),
      receipts,
      gatewayTransactions: gatewayTransactions.map((item) => ({
        ...item,
        orderId: item.orderId.toString(),
        amount: money(item.amount),
      })),
    };
  }

  async remove(id: string, reason: string, actorId?: string) {
    if (!actorId) {
      throw new UnauthorizedException();
    }
    const payment = await this.prisma.payment.findUnique({
      where: { id },
      select: { id: true, method: true, status: true, deletedAt: true },
    });
    if (!payment || payment.deletedAt) {
      throw new NotFoundException('پرداخت یافت نشد');
    }
    if (payment.method === 'ONLINE' && payment.status === 'PAID') {
      throw new BadRequestException('پرداخت آنلاین تسویه‌شده قابل حذف نیست');
    }
    await this.prisma.payment.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        deletedById: actorId,
        deleteReason: reason,
        payLinkExpiresAt:
          payment.method === 'ONLINE' && payment.status === 'PENDING' ? new Date() : undefined,
      },
    });
  }

  async addReceipt(paymentId: string, file: ReceiptUpload | undefined, actorId?: string) {
    if (!actorId) {
      throw new UnauthorizedException();
    }
    if (!file?.buffer?.length) {
      throw new BadRequestException('تصویر فیش ارسال نشده است');
    }
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      select: { id: true, deletedAt: true, _count: { select: { receipts: true } } },
    });
    if (!payment || payment.deletedAt) {
      throw new NotFoundException('پرداخت یافت نشد');
    }
    if (payment._count.receipts >= MAX_RECEIPTS) {
      throw new BadRequestException('حداکثر ۱۰ تصویر فیش برای هر پرداخت مجاز است');
    }
    const image = await this.images.store(file);
    try {
      return await this.prisma.paymentReceipt.create({
        data: {
          paymentId: payment.id,
          imageId: image.id,
          originalName: decodeFileName(file.originalname),
          uploadedById: actorId,
        },
        select: receiptSelect,
      });
    } catch (error) {
      await this.prisma.storedImage.deleteMany({ where: { id: image.id } });
      throw error;
    }
  }

  async removeReceipt(paymentId: string, receiptId: string) {
    const receipt = await this.prisma.paymentReceipt.findFirst({
      where: { id: receiptId, paymentId, payment: { deletedAt: null } },
      select: { id: true, imageId: true },
    });
    if (!receipt) {
      throw new NotFoundException('فیش یافت نشد');
    }
    await this.prisma.$transaction([
      this.prisma.paymentReceipt.delete({ where: { id: receipt.id } }),
      this.prisma.storedImage.delete({ where: { id: receipt.imageId } }),
    ]);
  }

  private async resolveSource(paymentGroupId: string | null, bankAccountId: string) {
    if (paymentGroupId) {
      const group = await this.prisma.paymentGroup.findUnique({
        where: { id: paymentGroupId },
        select: {
          id: true,
          title: true,
          bankAccountId: true,
          items: { select: { municipalFeeId: true } },
        },
      });
      if (!group) {
        throw new NotFoundException('گروه پرداخت یافت نشد');
      }
      if (group.bankAccountId !== bankAccountId) {
        throw new BadRequestException('حساب بانکی با گروه پرداخت یکی نیست');
      }
      return {
        paymentGroupId: group.id,
        paymentGroupTitle: group.title,
        bankAccountId: group.bankAccountId,
        allowedFeeIds: new Set(group.items.map((item) => item.municipalFeeId)),
      };
    }

    const account = await this.prisma.bankAccount.findUnique({
      where: { id: bankAccountId },
      select: { id: true },
    });
    if (!account) {
      throw new NotFoundException('حساب بانکی یافت نشد');
    }
    const fees = await this.prisma.municipalFee.findMany({
      where: { bankAccountId, isActive: true },
      select: { id: true },
    });
    return {
      paymentGroupId: null,
      paymentGroupTitle: null,
      bankAccountId,
      allowedFeeIds: new Set(fees.map((fee) => fee.id)),
    };
  }

  private async resolveDiscount(dto: CreatePaymentDto) {
    if (dto.discountMode === 'MANUAL') {
      return { id: null, title: null, percent: null };
    }
    if (!dto.discountId) {
      throw new BadRequestException('تخفیف را انتخاب کنید');
    }
    const discount = await this.prisma.discount.findUnique({
      where: { id: dto.discountId },
      select: { id: true, title: true, percent: true, isActive: true },
    });
    if (!discount || !discount.isActive) {
      throw new NotFoundException('تخفیف یافت نشد');
    }
    return {
      id: discount.id,
      title: discount.title,
      percent: discount.percent,
    };
  }

  private async historyWhere(query: FindPaymentsQueryDto): Promise<Prisma.PaymentWhereInput> {
    const from = query.from ? tehranDayStart(query.from) : undefined;
    const toStart = query.to ? tehranDayStart(query.to) : undefined;
    if ((query.from && !from) || (query.to && !toStart)) {
      throw new BadRequestException('تاریخ نامعتبر است');
    }
    if (from && toStart && from.getTime() > toStart.getTime()) {
      throw new BadRequestException('بازه تاریخ نامعتبر است');
    }
    const paidAt =
      from || toStart
        ? {
            gte: from,
            lt: toStart ? new Date(toStart.getTime() + 24 * 60 * 60 * 1000) : undefined,
          }
        : undefined;
    if (query.minAmount && query.maxAmount && BigInt(query.minAmount) > BigInt(query.maxAmount)) {
      throw new BadRequestException('بازه مبلغ نامعتبر است');
    }
    const finalAmount =
      query.minAmount || query.maxAmount
        ? { gte: query.minAmount, lte: query.maxAmount }
        : undefined;
    const deletedAt =
      query.deleted === 'only' ? { not: null } : query.deleted === 'true' ? undefined : null;
    return {
      paymentGroupId: query.paymentGroupId,
      bankAccountId: query.bankAccountId,
      method: query.method,
      status: query.status,
      deletedAt,
      paidAt,
      finalAmount,
      OR: this.searchFilter(query.q),
    };
  }

  private searchFilter(q?: string): Prisma.PaymentWhereInput[] | undefined {
    const term = q?.trim();
    if (!term) return undefined;
    const filters: Prisma.PaymentWhereInput[] = [
      { payerName: containsInsensitive(term) },
      { companyName: containsInsensitive(term) },
      { companyRegistrationNo: containsInsensitive(term) },
      { payer: { fullName: containsInsensitive(term) } },
      { payer: { companyName: containsInsensitive(term) } },
      { payer: { companyRegistrationNo: containsInsensitive(term) } },
      { description: containsInsensitive(term) },
      { paymentGroupTitle: containsInsensitive(term) },
      { discountTitle: containsInsensitive(term) },
      { receiptNumber: containsInsensitive(term) },
      { trackingCode: containsInsensitive(term) },
      { recordedBy: { fullName: containsInsensitive(term) } },
      { bankAccount: { bankName: containsInsensitive(term) } },
      { caseFile: { businessUnitTitle: containsInsensitive(term) } },
      { caseFile: { trackingCode: containsInsensitive(term) } },
      { caseFile: { licenseNumber: containsInsensitive(term) } },
      { caseFile: { cardNumber: containsInsensitive(term) } },
      { caseFile: { activityJob: { is: { title: containsInsensitive(term) } } } },
      { caseRequest: { is: { number: containsInsensitive(term) } } },
    ];
    const digits = normalizeSearchDigits(term);
    if (digits) {
      filters.push(
        { nationalId: containsInsensitive(digits) },
        { companyNationalId: containsInsensitive(digits) },
        { companyRegistrationNo: containsInsensitive(digits) },
        { payer: { nationalId: containsInsensitive(digits) } },
        { payer: { companyNationalId: containsInsensitive(digits) } },
        { payer: { companyRegistrationNo: containsInsensitive(digits) } },
        { receiptNumber: containsInsensitive(digits) },
        { trackingCode: containsInsensitive(digits) },
        { caseFile: { licenseNumber: containsInsensitive(digits) } },
        { caseFile: { cardNumber: containsInsensitive(digits) } },
        { caseFile: { trackingCode: containsInsensitive(digits) } },
        { bankAccount: { accountNumber: containsInsensitive(digits) } },
      );
    }
    return filters;
  }
}
