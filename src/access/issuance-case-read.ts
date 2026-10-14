import { CaseRequestStatus } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { issuanceReachedWhere } from '../cases/request-process';
import { matchCaseWizardRead } from './management-review-case-read';
import { normalizeApiPath } from './route-permissions';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function openAtIssuance(caseFileId?: string, userId?: string, nationalId?: string) {
  return {
    status: CaseRequestStatus.OPEN,
    AND: [issuanceReachedWhere()],
    ...(caseFileId ? { caseFileId } : {}),
    ...(userId ? { caseFile: { userId } } : {}),
    ...(nationalId ? { caseFile: { user: { nationalId } } } : {}),
  };
}

/** خواندن ویزارد برای صادرکننده، فقط پرونده‌ای که به صدور رسیده و هنوز باز است. */
export async function issuerCanRead(
  prisma: PrismaService,
  rawPath: string,
  query: Record<string, unknown> = {},
) {
  return matchCaseWizardRead(prisma, rawPath, query, {
    caseVisible: async (caseFileId) => {
      if (!UUID.test(caseFileId)) return false;
      const count = await prisma.caseRequest.count({ where: openAtIssuance(caseFileId) });
      return count > 0;
    },
    userVisible: async (userId) => {
      if (!UUID.test(userId)) return false;
      const count = await prisma.caseRequest.count({ where: openAtIssuance(undefined, userId) });
      return count > 0;
    },
    nationalIdVisible: async (nationalId) => {
      if (!nationalId) return false;
      const count = await prisma.caseRequest.count({ where: openAtIssuance(undefined, undefined, nationalId) });
      return count > 0;
    },
  });
}

export function issuerMayPost(rawPath: string) {
  const path = normalizeApiPath(rawPath);
  return (
    path === '/cases/formation/renewal-dates' ||
    path === '/cases/formation/location-draft' ||
    /^\/cases\/[0-9a-f-]{36}\/stewardship\/issue$/i.test(path) ||
    /^\/cases\/[0-9a-f-]{36}\/auction\/[0-9a-f-]{36}\/issue$/i.test(path)
  );
}

export function formationMayPost(rawPath: string) {
  const path = normalizeApiPath(rawPath);
  return /^\/cases\/[0-9a-f-]{36}\/stewardship\/step$/i.test(path);
}
