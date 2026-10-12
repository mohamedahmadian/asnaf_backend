import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type Db = PrismaService | Prisma.TransactionClient;

/** شغل و نشانی مؤثر: برای مباشرت از مجوز میزبان خوانده می‌شود. */
export async function activityContext(prisma: Db, caseFileId: string) {
  const row = await prisma.caseFile.findUnique({
    where: { id: caseFileId },
    select: {
      kind: true,
      activityJobId: true,
      businessUnitTitle: true,
      premiseAddress: true,
      activityJob: { select: { title: true } },
      hostCaseFile: {
        select: {
          activityJobId: true,
          businessUnitTitle: true,
          premiseAddress: true,
          activityJob: { select: { title: true } },
        },
      },
    },
  });
  if (!row) return null;
  const source = row.kind === 'STEWARDSHIP' && row.hostCaseFile ? row.hostCaseFile : row;
  return {
    activityJobId: source.activityJobId,
    businessUnitTitle: source.businessUnitTitle,
    premiseAddress: source.premiseAddress,
    activityJob: source.activityJob,
  };
}
