import { PrismaService } from '../prisma/prisma.service';
import { normalizeApiPath } from './route-permissions';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CASE_READ =
  /^\/cases\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\/(dossier|process|license|stewards|stewardship|renewal|place-change|auction)(?:\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}))?)?$/i;

function queryValue(query: Record<string, unknown>, key: string) {
  const value = query[key];
  return typeof value === 'string' ? value.trim() : '';
}

async function caseReadable(prisma: PrismaService, caseFileId: string) {
  if (!UUID.test(caseFileId)) return false;
  const count = await prisma.casePlacesReview.count({
    where: {
      OR: [{ caseFileId }, { caseFile: { hostCaseFileId: caseFileId } }],
    },
  });
  return count > 0;
}

async function userReadable(prisma: PrismaService, userId: string) {
  if (!UUID.test(userId)) return false;
  const count = await prisma.casePlacesReview.count({
    where: {
      OR: [{ caseFile: { userId } }, { caseFile: { hostCaseFile: { userId } } }],
    },
  });
  return count > 0;
}

async function nationalIdReadable(prisma: PrismaService, nationalId: string) {
  if (!nationalId) return false;
  const count = await prisma.casePlacesReview.count({
    where: {
      OR: [
        { caseFile: { user: { nationalId } } },
        { caseFile: { hostCaseFile: { user: { nationalId } } } },
      ],
    },
  });
  return count > 0;
}

async function violationReadable(prisma: PrismaService, violationId: string) {
  if (!UUID.test(violationId)) return false;
  const row = await prisma.violation.findUnique({
    where: { id: violationId },
    select: { nationalId: true, caseFileId: true },
  });
  if (!row) return false;
  if (row.caseFileId && (await caseReadable(prisma, row.caseFileId))) return true;
  return nationalIdReadable(prisma, row.nationalId);
}

/** خواندن پرونده برای اداره اماکن، فقط اگر همان پرونده (یا مجوز میزبانِ مباشر) نظر اماکن داشته باشد. */
export async function placesOfficerCanRead(
  prisma: PrismaService,
  rawPath: string,
  query: Record<string, unknown> = {},
) {
  const path = normalizeApiPath(rawPath);
  if (path === '/cases/formation/document-types' || path === '/cases/settings/general') {
    return true;
  }

  const caseMatch = CASE_READ.exec(path);
  if (caseMatch?.[1]) return caseReadable(prisma, caseMatch[1]);

  if (
    path === '/cases/formation/identity' ||
    path === '/cases/formation/activity-requirements' ||
    path === '/cases/formation/inquiries' ||
    path === '/cases/formation/places' ||
    path === '/cases/formation/management-approvers' ||
    path === '/cases/formation/activity-documents'
  ) {
    return caseReadable(prisma, queryValue(query, 'caseId'));
  }

  if (path === '/cases/formation/documents') {
    return userReadable(prisma, queryValue(query, 'userId'));
  }

  const placesLetter = /^\/cases\/formation\/places\/([0-9a-f-]{36})\/letter$/i.exec(path);
  if (placesLetter?.[1]) {
    const review = await prisma.casePlacesReview.findUnique({
      where: { id: placesLetter[1] },
      select: { caseFileId: true },
    });
    return review ? caseReadable(prisma, review.caseFileId) : false;
  }

  const documentFile = /^\/cases\/formation\/documents\/([0-9a-f-]{36})\/file$/i.exec(path);
  if (documentFile?.[1]) {
    const versionId = documentFile[1];
    const person = await prisma.personDocumentVersion.findUnique({
      where: { id: versionId },
      select: { personDocument: { select: { userId: true } } },
    });
    if (person) return userReadable(prisma, person.personDocument.userId);
    const activity = await prisma.caseActivityDocumentVersion.findUnique({
      where: { id: versionId },
      select: { caseActivityDocument: { select: { caseFileId: true } } },
    });
    return activity ? caseReadable(prisma, activity.caseActivityDocument.caseFileId) : false;
  }

  const managementFile = /^\/cases\/formation\/management-reviews\/files\/([0-9a-f-]{36})$/i.exec(path);
  if (managementFile?.[1]) {
    const file = await prisma.caseManagementReviewFile.findUnique({
      where: { id: managementFile[1] },
      select: { review: { select: { caseFileId: true } } },
    });
    return file ? caseReadable(prisma, file.review.caseFileId) : false;
  }

  const inquiryFile = /^\/cases\/inquiries\/files\/([0-9a-f-]{36})$/i.exec(path);
  if (inquiryFile?.[1]) {
    const file = await prisma.caseInquiryFile.findUnique({
      where: { id: inquiryFile[1] },
      select: { caseInquiry: { select: { caseFileId: true } } },
    });
    return file ? caseReadable(prisma, file.caseInquiry.caseFileId) : false;
  }

  const suspensionFile = /^\/cases\/suspensions\/files\/([0-9a-f-]{36})$/i.exec(path);
  if (suspensionFile?.[1]) {
    const file = await prisma.caseSuspensionFile.findUnique({
      where: { id: suspensionFile[1] },
      select: { suspension: { select: { caseFileId: true } } },
    });
    return file ? caseReadable(prisma, file.suspension.caseFileId) : false;
  }

  if (path === '/violations') {
    return nationalIdReadable(prisma, queryValue(query, 'nationalId'));
  }

  const violationsByCase = /^\/violations\/by-case\/([0-9a-f-]{36})$/i.exec(path);
  if (violationsByCase?.[1]) return caseReadable(prisma, violationsByCase[1]);

  const violation = /^\/violations\/([0-9a-f-]{36})(?:\/.*)?$/i.exec(path);
  if (violation?.[1] && path !== '/violations/report' && !path.startsWith('/violations/person')) {
    return violationReadable(prisma, violation[1]);
  }

  return false;
}
