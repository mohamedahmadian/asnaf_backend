import { PrismaClient } from '../generated/prisma/client';

const MENU_MOVES = [
  ['cases.inquiries-reports', 'reports.inquiry-centers'],
  ['cases.places-reports', 'reports.places-cases'],
  ['cases.management-reviews-reports', 'reports.referred-cases'],
  ['cases.reports', 'reports.case-files'],
] as const;

/** مجوزهای ذخیره‌شدهٔ چهار گزارش پرونده یک‌بار به ماژول گزارشات منتقل می‌شوند. */
export async function migrateReportMenuPermissions(prisma: PrismaClient) {
  const legacyRows = await prisma.rolePermission.findMany({
    where: { code: { in: MENU_MOVES.map(([from]) => from) } },
    select: { roleId: true, code: true },
  });

  for (const row of legacyRows) {
    const target = MENU_MOVES.find(([from]) => from === row.code)?.[1];
    if (!target) continue;
    await prisma.rolePermission.upsert({
      where: { roleId_code: { roleId: row.roleId, code: target } },
      update: {},
      create: { roleId: row.roleId, code: target },
    });
    await prisma.rolePermission.delete({
      where: { roleId_code: { roleId: row.roleId, code: row.code } },
    });
  }
}
