import { PrismaClient } from '../generated/prisma/client';

export const ADMIN_ROLE_CODE = 'ADMIN';
export const EMPLOYEE_ROLE_CODE = 'EMPLOYEE';
export const INQUIRY_OFFICER_ROLE_CODE = 'INQUIRY_OFFICER';
export const JOB_GROUP_REP_ROLE_CODE = 'JOB_GROUP_REP';
export const ECONOMIC_ACTOR_ROLE_CODE = 'ECONOMIC_ACTOR';
export const PLACES_OFFICER_ROLE_CODE = 'PLACES_OFFICER';
export const CASE_OPERATOR_ROLE_CODE = 'CASE_OPERATOR';

const PLACES_OFFICE_ID = 'default';

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
  {
    code: PLACES_OFFICER_ROLE_CODE,
    name: 'اداره اماکن',
    description: 'مسئول پیش‌فرض اداره اماکن؛ پرونده‌های دریافتی و گزارش اماکن',
  },
  {
    code: CASE_OPERATOR_ROLE_CODE,
    name: 'اپراتور پرونده',
    description: 'تشکیل پرونده و مدیریت پرونده‌ها',
  },
  {
    code: 'SPECIAL_INSPECTOR',
    name: 'بازرس ویژه',
    description: 'تأیید درخواست مجوز حراج',
  },
  {
    code: 'AUCTION_COMMITTEE',
    name: 'کارگروه حراج',
    description: 'تأیید درخواست مجوز حراج',
  },
  {
    code: 'COMMERCIAL_MANAGER',
    name: 'مدیر بازرگانی',
    description: 'تأیید درخواست مجوز حراج',
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

export async function ensurePlacesOfficerRole(prisma: PrismaClient) {
  const role = SYSTEM_ROLES.find((item) => item.code === PLACES_OFFICER_ROLE_CODE)!;
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
    data: [
      { roleId: saved.id, code: 'cases.places' },
      { roleId: saved.id, code: 'reports.places-cases' },
    ],
    skipDuplicates: true,
  });
  const office = await prisma.casePlacesOffice.findUnique({
    where: { id: PLACES_OFFICE_ID },
    select: { officerRoleId: true },
  });
  if (office && !office.officerRoleId) {
    await prisma.casePlacesOffice.update({
      where: { id: PLACES_OFFICE_ID },
      data: { officerRoleId: saved.id },
    });
  }
  return saved;
}

export async function ensureCaseOperatorRole(prisma: PrismaClient) {
  const role = SYSTEM_ROLES.find((item) => item.code === CASE_OPERATOR_ROLE_CODE)!;
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
    data: [
      { roleId: saved.id, code: 'cases.formation' },
      { roleId: saved.id, code: 'cases.management' },
    ],
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
