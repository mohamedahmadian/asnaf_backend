import { PaymentStatus } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type RequestFeeStatus = 'PAID' | 'PENDING' | 'UNPAID';

export type RequestFeeState = { status: RequestFeeStatus; discount: number };

/** وضعیت و سهم تخفیف هر هزینه در پرداخت‌های حذف‌نشدهٔ همین درخواست. پرداخت ناموفق حساب نمی‌شود. */
export async function requestFeeStates(prisma: PrismaService, requestId: string) {
  const payments = await prisma.payment.findMany({
    where: {
      caseRequestId: requestId,
      deletedAt: null,
      status: { in: [PaymentStatus.PAID, PaymentStatus.PENDING] },
    },
    select: {
      status: true,
      subtotal: true,
      discountAmount: true,
      lines: { select: { municipalFeeId: true, amount: true } },
    },
  });
  const states = new Map<string, RequestFeeState>();
  for (const payment of payments) {
    const subtotal = Number(payment.subtotal);
    const discount = Number(payment.discountAmount);
    for (const line of payment.lines) {
      if (!line.municipalFeeId) continue;
      const share = subtotal > 0 && discount > 0 ? Math.round((discount * Number(line.amount)) / subtotal) : 0;
      if (payment.status === PaymentStatus.PAID) {
        states.set(line.municipalFeeId, { status: 'PAID', discount: share });
      } else if (!states.has(line.municipalFeeId)) {
        states.set(line.municipalFeeId, { status: 'PENDING', discount: share });
      }
    }
  }
  return states;
}

export async function requestFeeStatuses(prisma: PrismaService, requestId: string) {
  const states = await requestFeeStates(prisma, requestId);
  return new Map([...states].map(([id, state]) => [id, state.status]));
}

/** مجموع هزینه‌های پرداخت‌نشده یا در انتظار پرداختِ همهٔ درخواست‌های پرونده */
export async function unpaidDebtForCase(prisma: PrismaService, caseId: string) {
  const fees = await prisma.caseRequestFee.findMany({
    where: { finance: { request: { caseFileId: caseId } } },
    select: { requestId: true, municipalFeeId: true, amount: true },
  });
  if (fees.length === 0) return 0;

  const requestIds = [...new Set(fees.map((fee) => fee.requestId))];
  const payments = await prisma.payment.findMany({
    where: {
      caseRequestId: { in: requestIds },
      deletedAt: null,
      status: { in: [PaymentStatus.PAID, PaymentStatus.PENDING] },
    },
    select: {
      caseRequestId: true,
      status: true,
      lines: { select: { municipalFeeId: true } },
    },
  });

  const states = new Map<string, RequestFeeStatus>();
  const key = (requestId: string, feeId: string) => `${requestId}:${feeId}`;
  for (const payment of payments) {
    if (!payment.caseRequestId) continue;
    for (const line of payment.lines) {
      if (!line.municipalFeeId) continue;
      const id = key(payment.caseRequestId, line.municipalFeeId);
      if (payment.status === PaymentStatus.PAID) {
        states.set(id, 'PAID');
      } else if (!states.has(id)) {
        states.set(id, 'PENDING');
      }
    }
  }

  return fees.reduce((sum, fee) => {
    const status = states.get(key(fee.requestId, fee.municipalFeeId)) ?? 'UNPAID';
    return status === 'PAID' ? sum : sum + Number(fee.amount);
  }, 0);
}
