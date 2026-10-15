import { CaseRequestStatus } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { managementReachedWhere } from '../cases/request-process';
import { normalizeApiPath } from './route-permissions';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CASE_READ =
  /^\/cases\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\/(dossier|process|license|stewards|stewardship|renewal|place-change|auction)(?:\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}))?)?$/i;

function queryValue(query: Record<string, unknown>, key: string) {
  const value = query[key];
  return typeof value === 'string' ? value.trim() : '';
}

async function roleIds(prisma: PrismaService, userId: string) {
  const rows = await prisma.userRole.findMany({
    where: { userId },
    select: { roleId: true },
  });
  return rows.map((row) => row.roleId);
}

async function caseVisible(prisma: PrismaService, caseFileId: string, actorRoleIds: string[]) {
  if (!UUID.test(caseFileId) || actorRoleIds.length === 0) return false;
  const review = await prisma.caseManagementReview.count({
    where: { caseFileId, roleId: { in: actorRoleIds } },
  });
  if (review > 0) return true;
  const configured = await prisma.caseProcessManagementRole.findMany({
    where: { roleId: { in: actorRoleIds } },
    select: { requestType: true },
  });
  if (!configured.length) return false;
  const reached = managementReachedWhere();
  const count = await prisma.caseRequest.count({
    where: {
      caseFileId,
      status: CaseRequestStatus.OPEN,
      type: { in: [...new Set(configured.map((item) => item.requestType))] },
      AND: [reached],
    },
  });
  return count > 0;
}

async function userVisible(prisma: PrismaService, userId: string, actorRoleIds: string[]) {
  if (!UUID.test(userId) || actorRoleIds.length === 0) return false;
  const review = await prisma.caseManagementReview.count({
    where: { roleId: { in: actorRoleIds }, caseFile: { userId } },
  });
  if (review > 0) return true;
  const configured = await prisma.caseProcessManagementRole.findMany({
    where: { roleId: { in: actorRoleIds } },
    select: { requestType: true },
  });
  if (!configured.length) return false;
  const count = await prisma.caseRequest.count({
    where: {
      caseFile: { userId },
      status: CaseRequestStatus.OPEN,
      type: { in: [...new Set(configured.map((item) => item.requestType))] },
      AND: [managementReachedWhere()],
    },
  });
  return count > 0;
}

async function nationalIdVisible(prisma: PrismaService, nationalId: string, actorRoleIds: string[]) {
  if (!nationalId || actorRoleIds.length === 0) return false;
  const review = await prisma.caseManagementReview.count({
    where: { roleId: { in: actorRoleIds }, caseFile: { user: { nationalId } } },
  });
  if (review > 0) return true;
  const configured = await prisma.caseProcessManagementRole.findMany({
    where: { roleId: { in: actorRoleIds } },
    select: { requestType: true },
  });
  if (!configured.length) return false;
  const count = await prisma.caseRequest.count({
    where: {
      caseFile: { user: { nationalId } },
      status: CaseRequestStatus.OPEN,
      type: { in: [...new Set(configured.map((item) => item.requestType))] },
      AND: [managementReachedWhere()],
    },
  });
  return count > 0;
}

type WizardReadScope = {
  caseVisible: (caseFileId: string) => Promise<boolean>;
  userVisible: (userId: string) => Promise<boolean>;
  nationalIdVisible: (nationalId: string) => Promise<boolean>;
};

/** خواندن ویزارد برای نقش تایید مدیریتی، فقط اگر همان پرونده تاییدیهٔ نقش او را داشته باشد. */
export async function managementReviewerCanRead(
  prisma: PrismaService,
  userId: string,
  rawPath: string,
  query: Record<string, unknown> = {},
) {
  const actorRoleIds = await roleIds(prisma, userId);
  if (!actorRoleIds.length) return false;
  return matchCaseWizardRead(prisma, rawPath, query, {
    caseVisible: (caseFileId) => caseVisible(prisma, caseFileId, actorRoleIds),
    userVisible: (ownerId) => userVisible(prisma, ownerId, actorRoleIds),
    nationalIdVisible: (nationalId) => nationalIdVisible(prisma, nationalId, actorRoleIds),
  });
}

export async function matchCaseWizardRead(
  prisma: PrismaService,
  rawPath: string,
  query: Record<string, unknown>,
  scope: WizardReadScope,
) {
  const path = normalizeApiPath(rawPath);
  if (
    path === '/cases/formation/document-types' ||
    path === '/cases/formation/document-catalog' ||
    path === '/cases/settings/general'
  ) {
    return true;
  }

  const visible = scope.caseVisible;

  const caseMatch = CASE_READ.exec(path);
  if (caseMatch?.[1]) return visible(caseMatch[1]);

  if (
    path === '/cases/formation/identity' ||
    path === '/cases/formation/activity-requirements' ||
    path === '/cases/formation/inquiries' ||
    path === '/cases/formation/places' ||
    path === '/cases/formation/management-approvers' ||
    path === '/cases/formation/activity-documents'
  ) {
    return visible(queryValue(query, 'caseId'));
  }

  if (path === '/cases/formation/documents') {
    return scope.userVisible(queryValue(query, 'userId'));
  }

  const placesLetter = /^\/cases\/formation\/places\/([0-9a-f-]{36})\/letter$/i.exec(path);
  if (placesLetter?.[1]) {
    const review = await prisma.casePlacesReview.findUnique({
      where: { id: placesLetter[1] },
      select: { caseFileId: true },
    });
    return review ? visible(review.caseFileId) : false;
  }

  const documentFile = /^\/cases\/formation\/documents\/([0-9a-f-]{36})\/file$/i.exec(path);
  if (documentFile?.[1]) {
    const versionId = documentFile[1];
    const person = await prisma.personDocumentVersion.findUnique({
      where: { id: versionId },
      select: { personDocument: { select: { userId: true } } },
    });
    if (person) return scope.userVisible(person.personDocument.userId);
    const activity = await prisma.caseActivityDocumentVersion.findUnique({
      where: { id: versionId },
      select: { caseActivityDocument: { select: { caseFileId: true } } },
    });
    return activity ? visible(activity.caseActivityDocument.caseFileId) : false;
  }

  const managementFile = /^\/cases\/formation\/management-reviews\/files\/([0-9a-f-]{36})$/i.exec(path);
  if (managementFile?.[1]) {
    const file = await prisma.caseManagementReviewFile.findUnique({
      where: { id: managementFile[1] },
      select: { review: { select: { caseFileId: true } } },
    });
    return file ? visible(file.review.caseFileId) : false;
  }

  const placesFile = /^\/cases\/places\/files\/([0-9a-f-]{36})$/i.exec(path);
  if (placesFile?.[1]) {
    const file = await prisma.casePlacesFile.findUnique({
      where: { id: placesFile[1] },
      select: { review: { select: { caseFileId: true } } },
    });
    return file ? visible(file.review.caseFileId) : false;
  }

  const inquiryFile = /^\/cases\/inquiries\/files\/([0-9a-f-]{36})$/i.exec(path);
  if (inquiryFile?.[1]) {
    const file = await prisma.caseInquiryFile.findUnique({
      where: { id: inquiryFile[1] },
      select: { caseInquiry: { select: { caseFileId: true } } },
    });
    return file ? visible(file.caseInquiry.caseFileId) : false;
  }

  const suspensionFile = /^\/cases\/suspensions\/files\/([0-9a-f-]{36})$/i.exec(path);
  if (suspensionFile?.[1]) {
    const file = await prisma.caseSuspensionFile.findUnique({
      where: { id: suspensionFile[1] },
      select: { suspension: { select: { caseFileId: true } } },
    });
    return file ? visible(file.suspension.caseFileId) : false;
  }

  if (path === '/violations') {
    return scope.nationalIdVisible(queryValue(query, 'nationalId'));
  }

  const violationsByCase = /^\/violations\/by-case\/([0-9a-f-]{36})$/i.exec(path);
  if (violationsByCase?.[1]) return visible(violationsByCase[1]);

  const violation = /^\/violations\/([0-9a-f-]{36})(?:\/.*)?$/i.exec(path);
  if (violation?.[1] && path !== '/violations/report' && !path.startsWith('/violations/person')) {
    const row = await prisma.violation.findUnique({
      where: { id: violation[1] },
      select: { nationalId: true, caseFileId: true },
    });
    if (!row) return false;
    if (row.caseFileId && (await visible(row.caseFileId))) return true;
    return scope.nationalIdVisible(row.nationalId);
  }

  return false;
}
