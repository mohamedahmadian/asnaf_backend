import { PrismaClient } from '../generated/prisma/client';

export const ADMIN_ROLE_CODE = 'ADMIN';
export const EMPLOYEE_ROLE_CODE = 'EMPLOYEE';

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
