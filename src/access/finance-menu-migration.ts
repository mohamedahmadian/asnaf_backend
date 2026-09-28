import { ADMIN_ROLE_CODE } from './access.constants';
import { PrismaClient } from '../generated/prisma/client';

const MENU_MOVES = [
  ['base-info.bank-accounts', 'finance.bank-accounts'],
  ['base-info.municipal-fees', 'finance.municipal-fees'],
  ['base-info.discounts', 'finance.discounts'],
] as const;

/**
 * منوهای مالی از اطلاعات پایه جدا شده‌اند.
 * مجوزهای ذخیره‌شده یک‌بار به ماژول finance منتقل می‌شوند.
 * وجود مجوز finance روی نقش مدیر نشان می‌دهد انتقال انجام شده است.
 */
export async function migrateFinanceMenuPermissions(prisma: PrismaClient) {
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

  const financeGrants = await prisma.rolePermission.count({
    where: {
      OR: [{ code: 'finance' }, { code: { startsWith: 'finance.' } }],
    },
  });
  if (legacyRows.length === 0 && financeGrants > 0) return;

  const baseInfoRoles = await prisma.rolePermission.findMany({
    where: { code: 'base-info' },
    select: { roleId: true },
  });
  for (const row of baseInfoRoles) {
    await prisma.rolePermission.upsert({
      where: { roleId_code: { roleId: row.roleId, code: 'finance' } },
      update: {},
      create: { roleId: row.roleId, code: 'finance' },
    });
  }

  const admin = await prisma.role.findUnique({
    where: { code: ADMIN_ROLE_CODE },
    select: { id: true },
  });
  if (!admin) return;
  await prisma.rolePermission.upsert({
    where: { roleId_code: { roleId: admin.id, code: 'finance' } },
    update: {},
    create: { roleId: admin.id, code: 'finance' },
  });
}
