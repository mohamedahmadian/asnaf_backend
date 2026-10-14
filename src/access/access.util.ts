import { PrismaService } from '../prisma/prisma.service';
import { ADMIN_ROLE_CODE } from './access.constants';
import { parentPermissionCode } from './permissions-catalog';

export type UserAccess = {
  isAdmin: boolean;
  roleCodes: string[];
  permissionCodes: string[];
};

export async function loadUserAccess(
  prisma: PrismaService,
  userId: string,
): Promise<UserAccess> {
  const rows = await prisma.userRole.findMany({
    where: { userId },
    select: {
      role: {
        select: {
          code: true,
          permissions: { select: { code: true } },
        },
      },
    },
  });
  const roleCodes = rows.map((row) => row.role.code);
  const isAdmin = roleCodes.includes(ADMIN_ROLE_CODE);
  const permissionCodes = isAdmin
    ? []
    : normalizeReportPermissions([
        ...new Set(rows.flatMap((row) => row.role.permissions.map((item) => item.code))),
      ]);
  if (!isAdmin) {
    const officerCenters = await prisma.inquiryCenter.count({
      where: { officerId: userId, isActive: true },
    });
    if (officerCenters > 0 && !permissionCodes.includes('cases.inquiries')) {
      permissionCodes.push('cases.inquiries');
    }
    const placesOffice = await prisma.casePlacesOffice.findUnique({
      where: { id: 'default' },
      select: { officerRoleId: true },
    });
    if (placesOffice?.officerRoleId) {
      const placesOfficer = await prisma.userRole.count({
        where: { userId, roleId: placesOffice.officerRoleId },
      });
      if (placesOfficer > 0 && !permissionCodes.includes('cases.places')) {
        permissionCodes.push('cases.places');
      }
    }
    const approverRole = await prisma.caseProcessManagementRole.findFirst({
      where: { role: { users: { some: { userId } } } },
      select: { id: true },
    });
    if (
      approverRole &&
      !permissionCodes.includes('cases.management-reviews') &&
      !permissionCodes.includes('cases.formation') &&
      !permissionCodes.includes('cases.management')
    ) {
      permissionCodes.push('cases.management-reviews');
    }
    if (permissionCodes.includes('cases.inquiries') && !permissionCodes.includes('reports.inquiry-centers')) {
      permissionCodes.push('reports.inquiry-centers');
    }
    if (permissionCodes.includes('cases.places') && !permissionCodes.includes('reports.places-cases')) {
      permissionCodes.push('reports.places-cases');
    }
    if (
      permissionCodes.includes('cases.management-reviews') &&
      !permissionCodes.includes('reports.referred-cases')
    ) {
      permissionCodes.push('reports.referred-cases');
    }
  }
  return { isAdmin, roleCodes, permissionCodes };
}

const REPORT_PERMISSION_ALIASES: Record<string, string> = {
  'cases.inquiries-reports': 'reports.inquiry-centers',
  'cases.places-reports': 'reports.places-cases',
  'cases.management-reviews-reports': 'reports.referred-cases',
  'cases.reports': 'reports.case-files',
};

export function normalizeReportPermissions(codes: string[]) {
  return [...new Set(codes.map((code) => REPORT_PERMISSION_ALIASES[code] ?? code))];
}

export function hasPermission(
  access: Pick<UserAccess, 'isAdmin' | 'permissionCodes'>,
  code: string,
) {
  if (access.isAdmin) return true;
  if (access.permissionCodes.includes(code)) return true;
  const parent = parentPermissionCode(code);
  return parent ? access.permissionCodes.includes(parent) : false;
}

export function hasAnyPermission(
  access: Pick<UserAccess, 'isAdmin' | 'permissionCodes'>,
  codes: string[],
) {
  return codes.some((code) => hasPermission(access, code));
}
