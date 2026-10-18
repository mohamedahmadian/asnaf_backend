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
