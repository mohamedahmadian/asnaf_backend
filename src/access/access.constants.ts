import { PrismaClient } from '../generated/prisma/client';

export const ADMIN_ROLE_CODE = 'ADMIN';
export const EMPLOYEE_ROLE_CODE = 'EMPLOYEE';
export const INQUIRY_OFFICER_ROLE_CODE = 'INQUIRY_OFFICER';
export const JOB_GROUP_REP_ROLE_CODE = 'JOB_GROUP_REP';
export const ECONOMIC_ACTOR_ROLE_CODE = 'ECONOMIC_ACTOR';

export const SYSTEM_ROLES = [
  {
    code: ADMIN_ROLE_CODE,
    name: 'مدیریت',
    description: 'دسترسی کامل به همه منوها و بخش‌های سامانه',
  },
  {
    code: EMPLOYEE_ROLE_CODE,
    name: 'کارمند',
    description: 'نقش پیش‌فرض کارکنان سامانه',
  },
  {
    code: INQUIRY_OFFICER_ROLE_CODE,
    name: 'کارمند صدور استعلام',
    description: 'پاسخ به استعلام پرونده از طرف مرکز استعلام؛ جدا از نقش کارمند',
  },
  {
    code: JOB_GROUP_REP_ROLE_CODE,
    name: 'نماینده گروه',
    description: 'نماینده یک گروه شغلی؛ با کد ملی و رمز عبور وارد سامانه می‌شود',
  },
  {
    code: ECONOMIC_ACTOR_ROLE_CODE,
    name: 'فعال اقتصادی',
    description: 'نقش پیش‌فرض شخص هنگام تشکیل پرونده؛ قابل حذف نیست',
  },
] as const;

export const RESERVED_ROLE_CODES = new Set<string>(
  SYSTEM_ROLES.map((role) => role.code),
);

export function isReservedRoleCode(code: string) {
  return RESERVED_ROLE_CODES.has(code);
}

export function isRolePermissionsLocked(code: string) {
  return code === ADMIN_ROLE_CODE;
}

export async function ensureSystemRoles(
  prisma: PrismaClient,
  overwriteNames = false,
) {
  for (const role of SYSTEM_ROLES) {
    await prisma.role.upsert({
      where: { code: role.code },
      update: overwriteNames
        ? {
            name: role.name,
            description: role.description,
            isSystem: true,
          }
        : { isSystem: true },
      create: {
        code: role.code,
        name: role.name,
        description: role.description,
        isSystem: true,
      },
    });
  }
}

export async function ensureJobGroupRepRole(prisma: PrismaClient) {
  const role = SYSTEM_ROLES.find((item) => item.code === JOB_GROUP_REP_ROLE_CODE)!;
  return prisma.role.upsert({
    where: { code: role.code },
    update: { isSystem: true },
    create: {
      code: role.code,
      name: role.name,
      description: role.description,
      isSystem: true,
    },
    select: { id: true },
  });
}

export async function ensureEconomicActorRole(prisma: PrismaClient) {
  const role = SYSTEM_ROLES.find((item) => item.code === ECONOMIC_ACTOR_ROLE_CODE)!;
  return prisma.role.upsert({
    where: { code: role.code },
    update: { isSystem: true },
    create: {
      code: role.code,
      name: role.name,
      description: role.description,
      isSystem: true,
    },
    select: { id: true },
  });
}

export async function ensureInquiryOfficerRole(prisma: PrismaClient) {
  const role = SYSTEM_ROLES.find((item) => item.code === INQUIRY_OFFICER_ROLE_CODE)!;
  const saved = await prisma.role.upsert({
    where: { code: role.code },
    update: { isSystem: true },
    create: {
      code: role.code,
      name: role.name,
      description: role.description,
      isSystem: true,
    },
    select: { id: true },
  });
  await prisma.rolePermission.createMany({
    data: [{ roleId: saved.id, code: 'cases.inquiries' }],
    skipDuplicates: true,
  });
  return saved;
}

export async function ensureEmployeeRole(prisma: PrismaClient) {
  const employee = SYSTEM_ROLES.find((role) => role.code === EMPLOYEE_ROLE_CODE)!;
  return prisma.role.upsert({
    where: { code: employee.code },
    update: { isSystem: true },
    create: {
      code: employee.code,
      name: employee.name,
      description: employee.description,
      isSystem: true,
    },
    select: { id: true },
  });
}
