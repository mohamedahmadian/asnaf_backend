import { randomUUID } from 'crypto';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { ensureEconomicActorRole } from '../access/access.constants';
import { normalizeNationalId } from '../common/national-id';
import {
  CaseFileKind,
  CaseFileStatus,
  CaseRequestStatus,
  CaseRequestType,
  CaseRevokeSource,
  Prisma,
  UserStatus,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CaseInquiriesService } from './case-inquiries.service';
import { CaseManagementApproversService } from './case-management-approvers.service';
import { CasePlacesService } from './case-places.service';
import {
  STEWARDSHIP_INQUIRY_STEP,
  STEWARDSHIP_ISSUANCE_STEP,
  STEWARDSHIP_MANAGEMENT_STEP,
  STEWARDSHIP_PLACES_STEP,
  assignStewardCardNumber,
  nextRequestNumber,
} from './formation-steps';
import { PersonFileStorage } from './person-file.storage';
import { matchesDocumentGender, recordStatus } from './request-process';

const ECONOMIC_ACTOR_INITIAL_PASSWORD = '11111111';

function parseDate(value: string | null | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return new Date(`${value}T00:00:00.000Z`);
}

function dateOnly(value: Date | null | undefined) {
  return value ? value.toISOString().slice(0, 10) : null;
}

function localTodayIso() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

const personSelect = {
  id: true,
  firstName: true,
  lastName: true,
  fatherName: true,
  lastNameEn: true,
  fullName: true,
  gender: true,
  religion: true,
  religionOther: true,
  nationalId: true,
  birthDate: true,
  residencyStatus: true,
  passportNumber: true,
  nationalCardExpiresAt: true,
  passportExpiresAt: true,
  identityCertificateNo: true,
  birthPlace: true,
  identityIssuedIn: true,
  countryId: true,
  phone: true,
  homePhone: true,
  postalCode: true,
  address: true,
  email: true,
  educationLevel: true,
  citizenGroup: true,
  jobId: true,
} satisfies Prisma.UserSelect;

@Injectable()
export class CaseStewardshipService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inquiries: CaseInquiriesService,
    private readonly places: CasePlacesService,
    private readonly management: CaseManagementApproversService,
    private readonly files: PersonFileStorage,
  ) {}

  async listForHost(hostCaseId: string) {
    const host = await this.prisma.caseFile.findUnique({
      where: { id: hostCaseId },
      select: { id: true, kind: true },
    });
    if (!host || host.kind !== CaseFileKind.LICENSE) return [];
    const rows = await this.prisma.caseFile.findMany({
      where: { hostCaseFileId: host.id, kind: CaseFileKind.STEWARDSHIP },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      select: stewardListSelect,
    });
    return rows.map(mapStewardRow);
  }

  async create(hostCaseId: string, nationalIdInput: string) {
    const nationalId = normalizeNationalId(nationalIdInput);
    if (!/^\d{10}$/.test(nationalId)) throw new BadRequestException('کد ملی معتبر نیست');
    const host = await this.prisma.caseFile.findUnique({
      where: { id: hostCaseId },
      select: {
        id: true,
        kind: true,
        status: true,
        userId: true,
        licenseNumber: true,
        user: { select: { nationalId: true } },
        suspensions: {
          where: { liftedAt: null },
          select: { startsAt: true, endsAt: true, liftedAt: true },
        },
      },
    });
    if (!host || host.kind !== CaseFileKind.LICENSE) throw new NotFoundException('پرونده یافت نشد');
    if (!host.licenseNumber) throw new BadRequestException('قبل از افزودن مباشر باید مجوز صادر شده باشد');
    if (host.status === CaseFileStatus.REVOKED) {
      throw new BadRequestException('روی پرونده ابطال‌شده مباشر اضافه نمی‌شود');
    }
    if (host.status === CaseFileStatus.SUSPENDED || host.suspensions.some((row) => suspensionCoversToday(row))) {
      throw new BadRequestException('روی پرونده معلق مباشر اضافه نمی‌شود');
    }
    if (host.user.nationalId === nationalId) {
      throw new BadRequestException('صاحب مجوز نمی‌تواند مباشر همان پروانه باشد');
    }

    const user = await this.resolveSteward(nationalId);
    if (user.id === host.userId) {
      throw new BadRequestException('صاحب مجوز نمی‌تواند مباشر همان پروانه باشد');
    }
    const open = await this.prisma.caseFile.findFirst({
      where: {
        kind: CaseFileKind.STEWARDSHIP,
        hostCaseFileId: host.id,
        userId: user.id,
        requests: { some: { type: CaseRequestType.STEWARDSHIP, status: CaseRequestStatus.OPEN } },
      },
      select: { id: true },
    });
    if (open) throw new BadRequestException('برای این شخص روی همین مجوز یک درخواست مباشرت باز وجود دارد');

    for (let attempt = 0; attempt < 4; attempt++) {
      const number = await nextRequestNumber(this.prisma);
      try {
        return await this.prisma.$transaction(async (tx) => {
          const again = await tx.caseFile.findFirst({
            where: {
              kind: CaseFileKind.STEWARDSHIP,
              hostCaseFileId: host.id,
              userId: user.id,
              requests: { some: { type: CaseRequestType.STEWARDSHIP, status: CaseRequestStatus.OPEN } },
            },
            select: { id: true },
          });
          if (again) throw new BadRequestException('برای این شخص روی همین مجوز یک درخواست مباشرت باز وجود دارد');
          const file = await tx.caseFile.create({
            data: {
              userId: user.id,
              kind: CaseFileKind.STEWARDSHIP,
              hostCaseFileId: host.id,
              formationStep: 0,
            },
            select: { id: true },
          });
          const request = await tx.caseRequest.create({
            data: {
              caseFileId: file.id,
              type: CaseRequestType.STEWARDSHIP,
              number,
              status: CaseRequestStatus.OPEN,
              formationStep: 0,
            },
            select: { id: true, number: true },
          });
          await tx.caseRequestEvent.create({
            data: { requestId: request.id, toStatus: CaseRequestStatus.OPEN },
          });
          return { id: file.id, requestId: request.id, requestNumber: request.number };
        });
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
      }
    }
    throw new ConflictException('صدور شماره درخواست انجام نشد');
  }

  async state(caseId: string) {
    const file = await this.loadSteward(caseId);
    return this.present(file);
  }

  async advance(caseId: string, step: number) {
    const file = await this.loadSteward(caseId);
    const request = this.openRequest(file);
    const requested = Math.min(Math.max(step, 0), STEWARDSHIP_ISSUANCE_STEP);
    let next = Math.max(request.formationStep, Math.min(requested, request.formationStep + 1));
    if (next >= STEWARDSHIP_INQUIRY_STEP) await this.assertIdentity(file);
    if (next >= STEWARDSHIP_PLACES_STEP) {
      await this.inquiries.ensureForUser(caseId);
      await this.inquiriesReady(request.id);
      await this.places.ensureForUser(caseId);
    }
    if (next >= STEWARDSHIP_MANAGEMENT_STEP) {
      await this.placesReady(request.id);
      await this.management.ensureForUser(caseId);
    }
    if (next >= STEWARDSHIP_ISSUANCE_STEP) await this.managementReady(request.id);
    await this.prisma.$transaction([
      this.prisma.caseRequest.update({ where: { id: request.id }, data: { formationStep: next } }),
      this.prisma.caseFile.update({ where: { id: file.id }, data: { formationStep: next } }),
    ]);
    return { formationStep: next };
  }

  async issue(caseId: string, issuedAtInput: string, actorId?: string) {
    const issuedAt = parseDate(issuedAtInput);
    if (!issuedAt) throw new BadRequestException('تاریخ صدور معتبر نیست');
    const file = await this.loadSteward(caseId);
    const request = this.openRequest(file);
    if (request.formationStep < STEWARDSHIP_ISSUANCE_STEP) {
      throw new BadRequestException('مرحله‌های مباشرت هنوز تمام نشده است');
    }
    await this.assertIdentity(file);
    await this.inquiries.ensureForUser(caseId);
    await this.places.ensureForUser(caseId);
    await this.management.ensureForUser(caseId);
    await this.inquiriesReady(request.id);
    await this.placesReady(request.id);
    await this.managementReady(request.id);
    return this.prisma.$transaction(async (tx) => {
      const card = await assignStewardCardNumber(tx, file.id, issuedAt);
      await tx.caseFile.update({
        where: { id: file.id },
        data: { formationStep: STEWARDSHIP_ISSUANCE_STEP },
      });
      const closed = await tx.caseRequest.updateMany({
        where: { id: request.id, status: CaseRequestStatus.OPEN },
        data: {
          status: CaseRequestStatus.COMPLETED,
          completedAt: new Date(),
          formationStep: STEWARDSHIP_ISSUANCE_STEP,
        },
      });
      if (closed.count !== 1) throw new ConflictException('درخواست قبلاً تکمیل شده است');
        await recordStatus(tx, request.id, CaseRequestStatus.OPEN, CaseRequestStatus.COMPLETED, actorId);
      return {
        id: file.id,
        cardNumber: card.cardNumber,
        cardIssuedAt: dateOnly(card.cardIssuedAt),
        cardExpiresAt: dateOnly(card.cardExpiresAt),
      };
    });
  }

  async revoke(
    caseId: string,
    source: 'HOST' | 'STEWARD',
    reason: string,
    actorId?: string,
    revokedOn?: string,
    upload?: { buffer: Buffer; mimeType: string; originalName: string },
  ) {
    const text = reason.trim();
    if (!text) throw new BadRequestException('متن درخواست را وارد کنید');
    const revokedAt = parseDate(revokedOn) ?? parseDate(localTodayIso());
    if (!revokedAt) throw new BadRequestException('تاریخ ابطال مباشرت معتبر نیست');
    const file = await this.prisma.caseFile.findUnique({
      where: { id: caseId },
      select: {
        id: true,
        userId: true,
        kind: true,
        status: true,
        requests: { where: { status: CaseRequestStatus.OPEN }, select: { id: true, status: true } },
      },
    });
    if (!file || file.kind !== CaseFileKind.STEWARDSHIP) throw new NotFoundException('پرونده مباشرت یافت نشد');
    if (file.status === CaseFileStatus.REVOKED) throw new BadRequestException('این کارت قبلاً ابطال شده است');
    const requestedAt = new Date();
    let storageKey: string | null = null;
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.caseFile.update({
          where: { id: file.id },
          data: {
            status: CaseFileStatus.REVOKED,
            revokeReason: text,
            revokeSource: source === 'HOST' ? CaseRevokeSource.HOST : CaseRevokeSource.STEWARD,
            revokeRequestedAt: requestedAt,
            revokedAt,
            revokedById: actorId ?? null,
            reactivatedAt: null,
          },
        });
        if (upload?.buffer?.length) {
          const fileId = randomUUID();
          const stored = await this.files.saveStewardRevoke({
            personId: file.userId,
            caseFileId: file.id,
            fileId,
            buffer: upload.buffer,
            mimeType: upload.mimeType,
            originalName: upload.originalName,
          });
          storageKey = stored.storageKey;
          await tx.caseStewardRevokeFile.create({
            data: {
              id: fileId,
              caseFileId: file.id,
              storageKey: stored.storageKey,
              originalName: stored.originalName,
              mimeType: stored.mimeType,
              byteSize: stored.byteSize,
            },
          });
        }
        for (const request of file.requests) {
          await tx.caseRequest.update({
            where: { id: request.id },
            data: { status: CaseRequestStatus.CANCELLED },
          });
          await recordStatus(tx, request.id, request.status, CaseRequestStatus.CANCELLED, actorId);
        }
      });
    } catch (error) {
      if (storageKey) await this.files.remove(storageKey);
      throw error;
    }
    return { id: file.id, status: CaseFileStatus.REVOKED, revokedAt: dateOnly(revokedAt) };
  }

  async revokeForLicense(hostCaseId: string, reason: string, actorId?: string) {
    const rows = await this.prisma.caseFile.findMany({
      where: {
        hostCaseFileId: hostCaseId,
        kind: CaseFileKind.STEWARDSHIP,
        status: { not: CaseFileStatus.REVOKED },
      },
      select: {
        id: true,
        requests: { where: { status: CaseRequestStatus.OPEN }, select: { id: true, status: true } },
      },
    });
    if (!rows.length) return;
    const revokedAt = new Date();
    await this.prisma.$transaction(async (tx) => {
      for (const row of rows) {
        await tx.caseFile.update({
          where: { id: row.id },
          data: {
            status: CaseFileStatus.REVOKED,
            revokeReason: reason,
            revokeSource: CaseRevokeSource.LICENSE,
            revokedAt,
            revokedById: actorId ?? null,
            reactivatedAt: null,
          },
        });
        for (const request of row.requests) {
          await tx.caseRequest.update({
            where: { id: request.id },
            data: { status: CaseRequestStatus.CANCELLED },
          });
          await recordStatus(tx, request.id, request.status, CaseRequestStatus.CANCELLED, actorId);
        }
      }
    });
  }

  private async resolveSteward(nationalId: string) {
    const existing = await this.prisma.user.findUnique({
      where: { nationalId },
      select: { id: true },
    });
    if (existing) return existing;
    const takenUsername = await this.prisma.user.findUnique({
      where: { username: nationalId },
      select: { id: true },
    });
    if (takenUsername) throw new ConflictException('این کد ملی قبلاً به‌عنوان نام کاربری ثبت شده است');
    const role = await ensureEconomicActorRole(this.prisma);
    const passwordHash = await bcrypt.hash(ECONOMIC_ACTOR_INITIAL_PASSWORD, 10);
    return this.prisma.user.create({
      data: {
        username: nationalId,
        passwordHash,
        nationalId,
        firstName: '',
        lastName: '',
        fullName: '',
        locale: 'fa',
        status: UserStatus.ACTIVE,
        userRoles: { create: { roleId: role.id } },
      },
      select: { id: true },
    });
  }

  private async loadSteward(caseId: string) {
    const file = await this.prisma.caseFile.findUnique({
      where: { id: caseId },
      select: stewardStateSelect,
    });
    if (!file || file.kind !== CaseFileKind.STEWARDSHIP) throw new NotFoundException('پرونده مباشرت یافت نشد');
    return file;
  }

  private openRequest(file: { status: CaseFileStatus; requests: { id: string; status: CaseRequestStatus; formationStep: number; type: CaseRequestType }[] }) {
    if (file.status === CaseFileStatus.REVOKED) throw new BadRequestException('این کارت ابطال شده است');
    const request = file.requests.find((row) => row.status === CaseRequestStatus.OPEN);
    if (!request) throw new BadRequestException('درخواست باز مباشرت یافت نشد');
    return request;
  }

  private async assertIdentity(file: { userId: string; user: { firstName: string; lastName: string; gender: 'MALE' | 'FEMALE' | null } }) {
    if (!file.user.firstName.trim() || !file.user.lastName.trim()) {
      throw new BadRequestException('نام و نام خانوادگی مباشر را کامل کنید');
    }
    const required = await this.prisma.caseIdentityDocument.findMany({
      select: { documentId: true, gender: true, document: { select: { isRequired: true } } },
    });
    const needed = required.filter(
      (row) => row.document.isRequired && matchesDocumentGender(row.gender, file.user.gender),
    );
    if (!needed.length) return;
    const stored = await this.prisma.personDocument.findMany({
      where: { userId: file.userId, documentId: { in: needed.map((row) => row.documentId) } },
      select: { documentId: true, versions: { select: { id: true }, take: 1 } },
    });
    const uploaded = new Set(stored.filter((row) => row.versions.length > 0).map((row) => row.documentId));
    if (needed.some((row) => !uploaded.has(row.documentId))) {
      throw new BadRequestException('مدارک هویتی الزامی مباشر کامل نیست');
    }
  }

  private async inquiriesReady(requestId: string) {
    const pending = await this.prisma.caseInquiry.count({
      where: { caseRequestId: requestId, status: 'PENDING' },
    });
    if (pending > 0) throw new BadRequestException('استعلام‌های این درخواست هنوز باز است');
  }

  private async placesReady(requestId: string) {
    const review = await this.prisma.casePlacesReview.findUnique({
      where: { caseRequestId: requestId },
      select: { status: true },
    });
    if (!review || review.status === 'PENDING') {
      throw new BadRequestException('نظر اداره اماکن هنوز ثبت نشده است');
    }
  }

  private async managementReady(requestId: string) {
    const configured = await this.prisma.caseProcessManagementRole.findMany({
      where: { requestType: CaseRequestType.STEWARDSHIP },
      select: { roleId: true },
    });
    if (!configured.length) return;
    const roleIds = configured.map((item) => item.roleId);
    const [pending, total] = await Promise.all([
      this.prisma.caseManagementReview.count({
        where: { caseRequestId: requestId, roleId: { in: roleIds }, status: 'PENDING' },
      }),
      this.prisma.caseManagementReview.count({
        where: { caseRequestId: requestId, roleId: { in: roleIds } },
      }),
    ]);
    if (total < configured.length || pending > 0) {
      throw new BadRequestException('تاییدهای مدیریتی این درخواست کامل نیست');
    }
  }

  private present(file: Prisma.CaseFileGetPayload<{ select: typeof stewardStateSelect }>) {
    const request = [...file.requests].sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())[0];
    return {
      id: file.id,
      kind: file.kind,
      status: file.status,
      formationStep: request?.status === CaseRequestStatus.OPEN ? request.formationStep : file.formationStep,
      revokeReason: file.status === CaseFileStatus.REVOKED ? file.revokeReason : null,
      revokeSource: file.status === CaseFileStatus.REVOKED ? file.revokeSource : null,
      cardNumber: file.cardNumber,
      cardIssuedAt: dateOnly(file.cardIssuedAt),
      cardExpiresAt: dateOnly(file.cardExpiresAt),
      request: request
        ? {
            id: request.id,
            number: request.number,
            status: request.status,
            formationStep: request.formationStep,
          }
        : null,
      person: {
        ...file.user,
        birthDate: dateOnly(file.user.birthDate),
        nationalCardExpiresAt: dateOnly(file.user.nationalCardExpiresAt),
        passportExpiresAt: dateOnly(file.user.passportExpiresAt),
        caseId: file.id,
        formationStep: file.formationStep,
        caseTrackingCode: file.trackingCode,
      },
      host: file.hostCaseFile
        ? {
            id: file.hostCaseFile.id,
            licenseNumber: file.hostCaseFile.licenseNumber,
            businessUnitTitle: file.hostCaseFile.businessUnitTitle,
            licenseIssuedAt: dateOnly(file.hostCaseFile.licenseIssuedAt),
            licenseExpiresAt: dateOnly(file.hostCaseFile.licenseExpiresAt),
            firstName: file.hostCaseFile.user.firstName,
            lastName: file.hostCaseFile.user.lastName,
            fullName: file.hostCaseFile.user.fullName,
            jobTitle: file.hostCaseFile.activityJob?.title ?? null,
            jobGroupTitle: file.hostCaseFile.activityJob?.group?.title ?? null,
          }
        : null,
    };
  }
}

function suspensionCoversToday(row: { startsAt: Date; endsAt: Date | null; liftedAt: Date | null }) {
  if (row.liftedAt) return false;
  const today = parseDate(localTodayIso());
  if (!today) return false;
  if (row.startsAt.getTime() > today.getTime()) return false;
  if (!row.endsAt) return true;
  return row.endsAt.getTime() >= today.getTime();
}

const stewardListSelect = {
  id: true,
  status: true,
  cardNumber: true,
  cardIssuedAt: true,
  cardExpiresAt: true,
  revokeSource: true,
  user: { select: { fullName: true, firstName: true, lastName: true, nationalId: true } },
  requests: {
    orderBy: [{ createdAt: 'desc' as const }, { id: 'desc' as const }],
    take: 1,
    select: { number: true, status: true },
  },
} satisfies Prisma.CaseFileSelect;

function mapStewardRow(row: Prisma.CaseFileGetPayload<{ select: typeof stewardListSelect }>) {
  const request = row.requests[0] ?? null;
  return {
    id: row.id,
    status: row.status,
    fullName: row.user.fullName,
    firstName: row.user.firstName,
    lastName: row.user.lastName,
    nationalId: row.user.nationalId,
    requestNumber: request?.number ?? null,
    requestStatus: request?.status ?? null,
    cardNumber: row.cardNumber,
    cardIssuedAt: dateOnly(row.cardIssuedAt),
    cardExpiresAt: dateOnly(row.cardExpiresAt),
    revokeSource: row.status === CaseFileStatus.REVOKED ? row.revokeSource : null,
  };
}

const stewardStateSelect = {
  id: true,
  kind: true,
  status: true,
  userId: true,
  formationStep: true,
  trackingCode: true,
  revokeReason: true,
  revokeSource: true,
  cardNumber: true,
  cardIssuedAt: true,
  cardExpiresAt: true,
  user: { select: personSelect },
  requests: {
    orderBy: [{ createdAt: 'desc' as const }, { id: 'desc' as const }],
    select: { id: true, number: true, status: true, formationStep: true, type: true, createdAt: true },
  },
  hostCaseFile: {
    select: {
      id: true,
      licenseNumber: true,
      businessUnitTitle: true,
      licenseIssuedAt: true,
      licenseExpiresAt: true,
      user: { select: { firstName: true, lastName: true, fullName: true } },
      activityJob: { select: { title: true, group: { select: { title: true } } } },
    },
  },
} satisfies Prisma.CaseFileSelect;
