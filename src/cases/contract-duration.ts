import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export const CONTRACT_DURATION_MIN = 1;
export const CONTRACT_DURATION_MAX = 5;
const SETTINGS_ID = 'default';

type Db = PrismaService | Prisma.TransactionClient;

export function clampContractYears(value: unknown) {
  const years = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(years)) return CONTRACT_DURATION_MIN;
  return Math.min(CONTRACT_DURATION_MAX, Math.max(CONTRACT_DURATION_MIN, years));
}

export async function readContractYears(prisma: Db) {
  const row = await prisma.caseGeneralSettings.findUnique({
    where: { id: SETTINGS_ID },
    select: { contractYears: true },
  });
  return clampContractYears(row?.contractYears);
}

export async function readStewardContractYears(prisma: Db) {
  const row = await prisma.caseGeneralSettings.findUnique({
    where: { id: SETTINGS_ID },
    select: { stewardContractYears: true },
  });
  return clampContractYears(row?.stewardContractYears);
}
