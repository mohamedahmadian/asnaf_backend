import { PrismaClient } from '../generated/prisma/client';

/**
 * نقش‌هایی که ارسال پیامک دارند، تاریخچه را هم می‌بینند.
 */
export async function migrateSmsHistoryMenuPermissions(prisma: PrismaClient) {
  const rows = await prisma.rolePermission.findMany({
    where: { code: { in: ['sms', 'sms.send'] } },
    select: { roleId: true },
  });
  const roleIds = [...new Set(rows.map((row) => row.roleId))];
  for (const roleId of roleIds) {
    await prisma.rolePermission.upsert({
      where: { roleId_code: { roleId, code: 'sms.history' } },
      update: {},
      create: { roleId, code: 'sms.history' },
    });
  }
}
