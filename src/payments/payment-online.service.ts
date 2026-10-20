import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import {
  PaymentGatewayChannel,
  PaymentGatewayStatus,
  Prisma,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SmsService } from '../sms/sms.service';
import { MellatGatewayService } from './mellat-gateway.service';
import { isPayLinkOpen, money, nextGatewayOrderId, payLinkUrl } from './payment-records';

const GATEWAY = 'MELLAT';
const DEFAULT_LINK_TTL_HOURS = 48;
/** پرداخت آنلاین در محل اگر تا این مدت تسویه نشود ناموفق می‌شود */
const OPERATOR_PENDING_TTL_MS = 24 * 60 * 60 * 1000;
/** تراکنشی که بانک برگشت داده ولی تأیید نشده بعد از این مدت استعلام می‌شود */
const STALE_CALLBACK_MS = 3 * 60 * 1000;
const RECONCILE_INTERVAL_MS = 5 * 60 * 1000;

const MELLAT_MESSAGES: Record<string, string> = {
  '11': 'شماره کارت نامعتبر است',
  '12': 'موجودی کافی نیست',
  '13': 'رمز نادرست است',
  '17': 'پرداخت توسط کاربر لغو شد',
  '21': 'پذیرنده نامعتبر است',
  '24': 'اطلاعات کاربری پذیرنده نامعتبر است',
  '25': 'مبلغ نامعتبر است',
  '31': 'پاسخ نامعتبر است',
  '41': 'شماره درخواست تکراری است',
  '421': 'IP سرور نزد درگاه بانک ثبت نشده است',
};

export type GatewayRedirect = { url: string; fields: Record<string, string> };

type CallbackBody = Record<string, unknown>;

function field(body: CallbackBody, name: string) {
  const value = body[name];
  return typeof value === 'string' ? value.trim() : '';
}

function maskPan(value: string) {
  return value ? value.slice(0, 32) : null;
}

@Injectable()
export class PaymentOnlineService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PaymentOnlineService.name);
  private timer: NodeJS.Timeout | null = null;
  private reconciling = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mellat: MellatGatewayService,
    private readonly sms: SmsService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.reconcile(), RECONCILE_INTERVAL_MS);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private get appUrl() {
    return (this.config.get<string>('PUBLIC_APP_URL') ?? '').trim().replace(/\/+$/, '');
  }

  private get callbackUrl() {
    const apiUrl = (this.config.get<string>('PUBLIC_API_URL') ?? '').trim().replace(/\/+$/, '');
    if (!apiUrl) {
      throw new BadRequestException('آدرس عمومی سامانه (PUBLIC_API_URL) تنظیم نشده است');
    }
    return `${apiUrl}/public/payment-gateway/mellat/callback`;
  }

  private linkTtlMs() {
    const hours = Number(this.config.get<string>('PAYMENT_LINK_TTL_HOURS'));
    const safe = Number.isFinite(hours) && hours > 0 ? hours : DEFAULT_LINK_TTL_HOURS;
    return safe * 60 * 60 * 1000;
  }

  newPayLink() {
    return {
      token: randomBytes(24).toString('base64url'),
      expiresAt: new Date(Date.now() + this.linkTtlMs()),
    };
  }

  async sendPayLink(paymentId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      select: {
        id: true,
        method: true,
        status: true,
        deletedAt: true,
        payLinkToken: true,
        payLinkExpiresAt: true,
        receiptNumber: true,
        finalAmount: true,
        payerName: true,
        payer: { select: { phone: true } },
      },
    });
    if (!payment || !payment.payLinkToken) {
      throw new NotFoundException('لینک پرداخت یافت نشد');
    }
    const phone = payment.payer.phone;
    if (!phone) {
      return { sent: false, reason: 'NO_PHONE' as const };
    }
    const amount = money(payment.finalAmount).toLocaleString('fa-IR');
    const body =
      `${payment.payerName} گرامی، مبلغ ${amount} ریال بابت رسید ${payment.receiptNumber} قابل پرداخت است:\n` +
      payLinkUrl(this.appUrl, payment.payLinkToken);
    const result = await this.sms.send({ phone, body, source: 'PAYMENT_LINK' });
    await this.prisma.payment.update({
      where: { id: payment.id },
      data: { payLinkSentAt: new Date() },
    });
    const skipped = Boolean((result as { skipped?: boolean }).skipped);
    return { sent: !skipped, reason: skipped ? ('SMS_UNAVAILABLE' as const) : null };
  }

  async renewPayLink(paymentId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      select: { id: true, method: true, status: true, deletedAt: true, payLinkToken: true },
    });
    if (!payment || payment.deletedAt) {
      throw new NotFoundException('پرداخت یافت نشد');
    }
    if (payment.method !== 'ONLINE' || payment.status === 'PAID') {
      throw new BadRequestException('این پرداخت لینک پرداخت ندارد');
    }
    const link = this.newPayLink();
    await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: 'PENDING',
        payLinkToken: payment.payLinkToken ?? link.token,
        payLinkExpiresAt: link.expiresAt,
      },
    });
    return this.sendPayLink(payment.id);
  }

  async startForOperator(paymentId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      select: { id: true, method: true, status: true, deletedAt: true, finalAmount: true, receiptNumber: true },
    });
    if (!payment || payment.deletedAt) {
      throw new NotFoundException('پرداخت یافت نشد');
    }
    if (payment.method !== 'ONLINE' || payment.status === 'PAID') {
      throw new BadRequestException('این پرداخت قابل پرداخت آنلاین نیست');
    }
    if (payment.status === 'FAILED') {
      await this.prisma.payment.update({ where: { id: payment.id }, data: { status: 'PENDING' } });
    }
    return this.start(payment, PaymentGatewayChannel.OPERATOR);
  }

  async publicSummary(token: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { payLinkToken: token },
      select: {
        id: true,
        method: true,
        status: true,
        deletedAt: true,
        payLinkToken: true,
        payLinkExpiresAt: true,
        receiptNumber: true,
        payerName: true,
        personType: true,
        subtotal: true,
        discountAmount: true,
        finalAmount: true,
        trackingCode: true,
        paidAt: true,
        createdAt: true,
        bankAccount: { select: { bankName: true } },
        lines: {
          orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
          select: { id: true, title: true, amount: true },
        },
      },
    });
    if (!payment || payment.deletedAt) {
      throw new NotFoundException('لینک پرداخت نامعتبر است');
    }
    return {
      receiptNumber: payment.receiptNumber,
      payerName: payment.payerName,
      personType: payment.personType,
      status: payment.status,
      open: isPayLinkOpen(payment),
      expiresAt: payment.payLinkExpiresAt,
      subtotal: money(payment.subtotal),
      discountAmount: money(payment.discountAmount),
      finalAmount: money(payment.finalAmount),
      trackingCode: payment.status === 'PAID' ? payment.trackingCode : null,
      paidAt: payment.status === 'PAID' ? payment.paidAt : null,
      createdAt: payment.createdAt,
      bankName: payment.bankAccount.bankName,
      lines: payment.lines.map((line) => ({ id: line.id, title: line.title, amount: money(line.amount) })),
    };
  }

  async startForPublic(token: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { payLinkToken: token },
      select: {
        id: true,
        method: true,
        status: true,
        deletedAt: true,
        payLinkToken: true,
        payLinkExpiresAt: true,
        finalAmount: true,
        receiptNumber: true,
      },
    });
    if (!payment || !isPayLinkOpen(payment)) {
      throw new BadRequestException('لینک پرداخت منقضی یا نامعتبر است');
    }
    return this.start(payment, PaymentGatewayChannel.PUBLIC_LINK);
  }

  private async start(
    payment: { id: string; finalAmount: Prisma.Decimal; receiptNumber: string },
    channel: PaymentGatewayChannel,
  ): Promise<GatewayRedirect> {
    const amount = money(payment.finalAmount);
    const orderId = await nextGatewayOrderId(this.prisma);
    const tx = await this.prisma.paymentGatewayTransaction.create({
      data: { paymentId: payment.id, gateway: GATEWAY, channel, orderId, amount },
      select: { id: true },
    });
    const result = await this.mellat.payRequest({
      orderId,
      amount,
      callBackUrl: this.callbackUrl,
      additionalData: payment.receiptNumber,
    });
    if (!result.ok || !result.refId) {
      await this.prisma.paymentGatewayTransaction.update({
        where: { id: tx.id },
        data: { status: PaymentGatewayStatus.FAILED, resCode: result.resCode, rawResponse: { pay: result.raw } },
      });
      throw new BadRequestException(
        MELLAT_MESSAGES[result.resCode] ?? `درگاه بانک درخواست را نپذیرفت (کد ${result.resCode})`,
      );
    }
    await this.prisma.paymentGatewayTransaction.update({
      where: { id: tx.id },
      data: { refId: result.refId, rawResponse: { pay: result.raw } },
    });
    return { url: this.mellat.startPayUrl, fields: { RefId: result.refId } };
  }

  /** پاسخ بانک را پردازش می‌کند و آدرس بازگشت کاربر را برمی‌گرداند. */
  async handleMellatCallback(body: CallbackBody) {
    const refId = field(body, 'RefId');
    const resCode = field(body, 'ResCode');
    const saleOrderId = field(body, 'SaleOrderId');
    const saleReferenceId = field(body, 'SaleReferenceId');
    const cardHolderPan = field(body, 'CardHolderPan');
    const fallback = `${this.appUrl}/`;
    if (!/^\d{1,19}$/.test(saleOrderId)) {
      return fallback;
    }
    const tx = await this.prisma.paymentGatewayTransaction.findUnique({
      where: { orderId: BigInt(saleOrderId) },
      select: {
        id: true,
        refId: true,
        status: true,
        channel: true,
        orderId: true,
        payment: { select: { id: true, payLinkToken: true, deletedAt: true } },
      },
    });
    if (!tx || (tx.refId && refId && tx.refId !== refId)) {
      return fallback;
    }
    const target = (ok: boolean) => this.returnUrl(tx.channel, tx.payment, ok);

    if (tx.status === PaymentGatewayStatus.VERIFIED || tx.status === PaymentGatewayStatus.SETTLED) {
      return target(true);
    }
    const claimed = await this.prisma.paymentGatewayTransaction.updateMany({
      where: { id: tx.id, status: PaymentGatewayStatus.INITIATED, resCode: null },
      data: {
        resCode: resCode || 'UNKNOWN',
        saleReferenceId: saleReferenceId || null,
        cardHolderPan: maskPan(cardHolderPan),
        rawResponse: { callback: body } as Prisma.InputJsonValue,
      },
    });
    if (claimed.count === 0) {
      return target(false);
    }
    if (resCode !== '0' || !saleReferenceId) {
      await this.prisma.paymentGatewayTransaction.update({
        where: { id: tx.id },
        data: { status: PaymentGatewayStatus.FAILED },
      });
      return target(false);
    }
    const ok = await this.confirm(
      { id: tx.id, orderId: tx.orderId, paymentId: tx.payment.id, deleted: Boolean(tx.payment.deletedAt) },
      saleOrderId,
      saleReferenceId,
    );
    return target(ok);
  }

  private returnUrl(
    channel: PaymentGatewayChannel,
    payment: { id: string; payLinkToken: string | null },
    ok: boolean,
  ) {
    const result = ok ? 'ok' : 'failed';
    if (channel === PaymentGatewayChannel.PUBLIC_LINK && payment.payLinkToken) {
      return `${this.appUrl}/pay/${payment.payLinkToken}?gateway=${result}`;
    }
    return `${this.appUrl}/finance/payment-history/${payment.id}?gateway=${result}`;
  }

  /** verify و settle؛ در خطای verify استعلام و در صورت نیاز برگشت وجه. */
  private async confirm(
    tx: { id: string; orderId: bigint; paymentId: string; deleted: boolean },
    saleOrderId: string,
    saleReferenceId: string,
  ) {
    const input = { orderId: tx.orderId, saleOrderId, saleReferenceId };
    if (tx.deleted) {
      await this.reverse(tx.id, input);
      return false;
    }
    let verified = false;
    try {
      verified = (await this.mellat.verify(input)).ok;
    } catch (error) {
      this.logger.warn(`Verify failed for order ${saleOrderId}: ${(error as Error).message}`);
    }
    if (!verified) {
      try {
        verified = (await this.mellat.inquiry(input)).ok;
      } catch (error) {
        this.logger.warn(`Inquiry failed for order ${saleOrderId}: ${(error as Error).message}`);
        return false;
      }
    }
    if (!verified) {
      await this.reverse(tx.id, input);
      return false;
    }
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.paymentGatewayTransaction.update({
        where: { id: tx.id },
        data: { status: PaymentGatewayStatus.VERIFIED, verifiedAt: now },
      }),
      this.prisma.payment.update({
        where: { id: tx.paymentId },
        data: { status: 'PAID', paidAt: now, trackingCode: saleReferenceId },
      }),
    ]);
    await this.settle(tx.id, input);
    return true;
  }

  private async settle(txId: string, input: { orderId: bigint; saleOrderId: string; saleReferenceId: string }) {
    try {
      const result = await this.mellat.settle(input);
      if (result.ok) {
        await this.prisma.paymentGatewayTransaction.update({
          where: { id: txId },
          data: { status: PaymentGatewayStatus.SETTLED, settledAt: new Date() },
        });
      }
    } catch (error) {
      this.logger.warn(`Settle failed for order ${input.saleOrderId}: ${(error as Error).message}`);
    }
  }

  private async reverse(txId: string, input: { orderId: bigint; saleOrderId: string; saleReferenceId: string }) {
    let reversed = false;
    try {
      reversed = (await this.mellat.reversal(input)).ok;
    } catch (error) {
      this.logger.warn(`Reversal failed for order ${input.saleOrderId}: ${(error as Error).message}`);
    }
    await this.prisma.paymentGatewayTransaction.update({
      where: { id: txId },
      data: { status: reversed ? PaymentGatewayStatus.REVERSED : PaymentGatewayStatus.FAILED },
    });
  }

  /** تراکنش‌های نیمه‌کاره و پرداخت‌های منقضی را تعیین تکلیف می‌کند. */
  async reconcile() {
    if (this.reconciling) return;
    this.reconciling = true;
    try {
      const staleBefore = new Date(Date.now() - STALE_CALLBACK_MS);
      const unsettled = await this.prisma.paymentGatewayTransaction.findMany({
        where: {
          OR: [
            { status: PaymentGatewayStatus.VERIFIED },
            {
              status: PaymentGatewayStatus.INITIATED,
              resCode: '0',
              saleReferenceId: { not: null },
              createdAt: { lt: staleBefore },
            },
          ],
        },
        take: 50,
        select: {
          id: true,
          status: true,
          orderId: true,
          saleReferenceId: true,
          paymentId: true,
          payment: { select: { deletedAt: true } },
        },
      });
      for (const tx of unsettled) {
        if (!tx.saleReferenceId) continue;
        const input = {
          orderId: tx.orderId,
          saleOrderId: tx.orderId.toString(),
          saleReferenceId: tx.saleReferenceId,
        };
        if (tx.status === PaymentGatewayStatus.VERIFIED) {
          await this.settle(tx.id, input);
        } else {
          await this.confirm(
            { id: tx.id, orderId: tx.orderId, paymentId: tx.paymentId, deleted: Boolean(tx.payment.deletedAt) },
            input.saleOrderId,
            input.saleReferenceId,
          );
        }
      }

      const now = new Date();
      await this.prisma.payment.updateMany({
        where: {
          method: 'ONLINE',
          status: 'PENDING',
          OR: [
            { payLinkToken: { not: null }, payLinkExpiresAt: { lt: now } },
            { payLinkToken: null, createdAt: { lt: new Date(now.getTime() - OPERATOR_PENDING_TTL_MS) } },
          ],
          gatewayTransactions: {
            none: {
              status: { in: [PaymentGatewayStatus.VERIFIED, PaymentGatewayStatus.SETTLED] },
            },
          },
        },
        data: { status: 'FAILED' },
      });
    } catch (error) {
      this.logger.error(`Payment reconcile failed: ${(error as Error).message}`);
    } finally {
      this.reconciling = false;
    }
  }
}
