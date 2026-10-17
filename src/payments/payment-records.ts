import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { gregorianToJalali, tehranDate } from '../violations/calendar';

export const caseSelect = {
  id: true,
  kind: true,
  status: true,
  trackingCode: true,
  licenseNumber: true,
  cardNumber: true,
  businessUnitTitle: true,
  activityJob: { select: { title: true, group: { select: { title: true } } } },
} satisfies Prisma.CaseFileSelect;

const bankAccountSelect = {
  id: true,
  bankName: true,
  accountNumber: true,
  isActive: true,
} satisfies Prisma.BankAccountSelect;

export const paymentSelect = {
  id: true,
  personType: true,
  nationalId: true,
  companyName: true,
  companyNationalId: true,
  companyRegistrationNo: true,
  payerName: true,
  description: true,
  paymentGroupId: true,
  paymentGroupTitle: true,
  discountMode: true,
  discountId: true,
  discountTitle: true,
  discountPercent: true,
  feeCount: true,
  subtotal: true,
  discountAmount: true,
  finalAmount: true,
  method: true,
  status: true,
  trackingCode: true,
  receiptNumber: true,
  payLinkToken: true,
  payLinkExpiresAt: true,
  payLinkSentAt: true,
  deletedAt: true,
  deleteReason: true,
  paidAt: true,
  createdAt: true,
  recordedBy: { select: { id: true, fullName: true } },
  deletedBy: { select: { id: true, fullName: true } },
  payer: {
    select: {
      id: true,
      fullName: true,
      companyName: true,
      phone: true,
    },
  },
  bankAccount: { select: bankAccountSelect },
  caseFile: { select: caseSelect },
  caseRequest: { select: { id: true, number: true, type: true, status: true } },
  _count: { select: { receipts: true } },
} satisfies Prisma.PaymentSelect;

export type PaymentRow = Prisma.PaymentGetPayload<{ select: typeof paymentSelect }>;

export function money(value: Prisma.Decimal | number) {
  return typeof value === 'number' ? value : Number(value);
}

function optionalMoney(value: Prisma.Decimal | number | null) {
  if (value == null) return null;
  return money(value);
}

export function mapCaseFile(file: Prisma.CaseFileGetPayload<{ select: typeof caseSelect }>) {
  return {
    id: file.id,
    kind: file.kind,
    status: file.status,
    trackingCode: file.trackingCode,
    licenseNumber: file.licenseNumber,
    cardNumber: file.cardNumber,
    businessUnitTitle: file.businessUnitTitle,
    activityJobTitle: file.activityJob?.title ?? null,
    jobGroupTitle: file.activityJob?.group?.title ?? null,
  };
}

export function payLinkUrl(appUrl: string | undefined, token: string) {
  const base = (appUrl ?? '').trim().replace(/\/+$/, '');
  return `${base}/pay/${token}`;
}

export function isPayLinkOpen(row: {
  method: string;
  status: string;
  deletedAt: Date | null;
  payLinkToken: string | null;
  payLinkExpiresAt: Date | null;
}) {
  return (
    row.method === 'ONLINE' &&
    row.status === 'PENDING' &&
    !row.deletedAt &&
    Boolean(row.payLinkToken) &&
    Boolean(row.payLinkExpiresAt && row.payLinkExpiresAt.getTime() > Date.now())
  );
}

export function mapPayment(row: PaymentRow, appUrl?: string) {
  const currentPayerName =
    row.personType === 'LEGAL'
      ? row.payer.companyName?.trim() || row.payer.fullName
      : row.payer.fullName;
  return {
    id: row.id,
    personType: row.personType,
    nationalId: row.nationalId,
    companyName: row.companyName,
    companyNationalId: row.companyNationalId,
    companyRegistrationNo: row.companyRegistrationNo,
    payerName: row.payerName,
    currentPayerName: currentPayerName !== row.payerName ? currentPayerName : null,
    payerPhone: row.payer.phone,
    description: row.description,
    paymentGroupId: row.paymentGroupId,
    paymentGroupTitle: row.paymentGroupTitle,
    discountMode: row.discountMode,
    discountId: row.discountId,
    discountTitle: row.discountTitle,
    discountPercent: optionalMoney(row.discountPercent),
    feeCount: row.feeCount,
    subtotal: money(row.subtotal),
    discountAmount: money(row.discountAmount),
    finalAmount: money(row.finalAmount),
    method: row.method,
    status: row.status,
    trackingCode: row.trackingCode,
    receiptNumber: row.receiptNumber,
    payLink:
      row.payLinkToken && row.method === 'ONLINE'
        ? {
            url: payLinkUrl(appUrl, row.payLinkToken),
            expiresAt: row.payLinkExpiresAt,
            sentAt: row.payLinkSentAt,
            open: isPayLinkOpen(row),
          }
        : null,
    deletedAt: row.deletedAt,
    deleteReason: row.deleteReason,
    deletedBy: row.deletedBy,
    paidAt: row.status === 'PAID' ? row.paidAt : null,
    createdAt: row.createdAt,
    recordedBy: row.recordedBy,
    bankAccount: row.bankAccount,
    caseFile: row.caseFile ? mapCaseFile(row.caseFile) : null,
    caseRequest: row.caseRequest,
    receiptCount: row._count.receipts,
  };
}

/** شمارهٔ رسید ترتیبی با پیشوند سال جلالی تهران، مثل 1405-000123 */
export async function nextReceiptNumber(prisma: PrismaService) {
  const [row] = await prisma.$queryRaw<{ value: bigint }[]>`SELECT nextval('payment_receipt_seq') AS value`;
  const today = tehranDate();
  const year = gregorianToJalali(today.year, today.month, today.day).year;
  return `${year}-${String(row.value).padStart(6, '0')}`;
}

export async function nextGatewayOrderId(prisma: PrismaService) {
  const [row] = await prisma.$queryRaw<{ value: bigint }[]>`SELECT nextval('payment_gateway_order_seq') AS value`;
  return BigInt(row.value);
}
