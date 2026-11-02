import { randomUUID } from 'crypto';
import { BadRequestException, Inject, Injectable, NotFoundException, forwardRef } from '@nestjs/common';
import {
  CaseFileKind,
  CaseFileStatus,
  CaseInquiryStatus,
  CaseRequestStatus,
  CaseRequestType,
  Prisma,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CaseLetterheadService } from './case-letterhead.service';
import type { CasesService } from './cases.service';
import { PersonFileStorage } from './person-file.storage';
import { processManagementTitles } from './request-process';
import {
  CompleteCaseRevocationDto,
  SaveCaseRevocationAmountDto,
} from './dto/case-revocation-process.dto';

const SETTINGS_ID = 'default';

function dateOnly(value: Date | null | undefined) {
  if (!value) return null;
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(
    value.getDate(),
  ).padStart(2, '0')}`;
}

function parseDateOnly(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(year, month - 1, day, 12, 0, 0, 0);
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    throw new BadRequestException('تاریخ ابطال معتبر نیست');
  }
  return parsed;
}

type StoredFile = {
  id: string;
  originalName: string | null;
  mimeType: string;
  byteSize: number;
  createdAt: Date;
};

@Injectable()
export class CaseRevocationProcessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly letterhead: CaseLetterheadService,
    @Inject(
      forwardRef(
        () =>
          require('./cases.service').CasesService as typeof import('./cases.service').CasesService,
      ),
    )
    private readonly cases: CasesService,
    private readonly files: PersonFileStorage,
  ) {}

  async state(caseFileId: string) {
    const file = await this.caseSubject(caseFileId);
    const request = await this.latestRequest(caseFileId);
    const existing = await this.prisma.caseRevocationProcess.findUnique({
      where: { caseFileId },
      include: {
        letters: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] },
        files: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
      },
    });
    const canStart = await this.canStartProcess(caseFileId, request);
    const process =
      existing ??
      (canStart && (!request || this.requestReady(request))
        ? await this.ensure(caseFileId, request?.id)
        : null);
    if (process && request && request.status === CaseRequestStatus.OPEN && this.requestReady(request)) {
      await this.markIssued(request.id, process.id);
    }
    const firstRenewal = await this.prisma.caseRequest.findFirst({
      where: {
        caseFileId,
        type: CaseRequestType.RENEWAL,
        renewalTerms: { isNot: null },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { renewalTerms: { select: { currentIssuedAt: true } } },
    });
    return {
      id: process?.id ?? null,
      processStarted: Boolean(process),
      amount: process ? Number(process.amount) : 0,
      revocationDate: dateOnly(process?.revocationDate),
      status: file.status,
      case: {
        id: file.id,
        businessUnitTitle: file.businessUnitTitle,
        licenseNumber: file.licenseNumber,
        licenseIssuedAt: dateOnly(file.licenseIssuedAt),
        firstIssuedAt: dateOnly(firstRenewal?.renewalTerms?.currentIssuedAt ?? file.licenseIssuedAt),
        fullName: file.user.fullName,
        nationalId: file.user.nationalId,
        jobTitle: file.activityJob?.title ?? null,
      },
      request: request
        ? {
            id: request.id,
            number: request.number,
            status: request.status,
            reason: request.revocation?.reason ?? null,
            createdAt: request.createdAt.toISOString(),
            files: (request.revocation?.files ?? []).map((item) => this.mapFile(item)),
          }
        : null,
      files: (process?.files ?? []).map((item) => this.mapFile(item)),
      letters: (process?.letters ?? []).map((letter) => ({
        id: letter.id,
        centerName: letter.centerName,
        letterNo: letter.letterNo,
        issuedAt: dateOnly(letter.issuedAt),
      })),
    };
  }

  async startFromApprovedRequest(requestId: string) {
    const request = await this.prisma.caseRequest.findUnique({
      where: { id: requestId },
      include: {
        revocation: true,
        managementReviews: { select: { status: true, roleId: true } },
      },
    });
    if (!request || request.type !== CaseRequestType.REVOCATION) return null;
    if (request.status === CaseRequestStatus.REJECTED || request.status === CaseRequestStatus.CANCELLED) {
      return null;
    }
    const rejected = request.managementReviews.some((row) => row.status === CaseInquiryStatus.REJECTED);
    if (rejected) {
      await this.markRejected(request.id);
      return null;
    }
    if (!this.requestReady(request)) return null;
    const process = await this.ensure(request.caseFileId, request.id);
    await this.markIssued(request.id, process.id);
    return { id: process.id };
  }

  async saveAmount(caseFileId: string, dto: SaveCaseRevocationAmountDto) {
    const process = await this.requireProcess(caseFileId);
    await this.assertMutable(caseFileId);
    await this.prisma.caseRevocationProcess.update({
      where: { id: process.id },
      data: { amount: new Prisma.Decimal(dto.amount) },
    });
    return this.state(caseFileId);
  }

  async letter(caseFileId: string, letterId: string) {
    await this.requireProcess(caseFileId);
    const letter = await this.prisma.caseRevocationLetter.findFirst({
      where: { id: letterId, process: { caseFileId } },
    });
    if (!letter) throw new NotFoundException('نامه یافت نشد');
    const [file, issued] = await Promise.all([
      this.caseSubject(caseFileId),
      this.letterhead.openLetter('revocation', letter.id),
    ]);
    const fields = {
      fullName: file.user.fullName,
      nationalId: file.user.nationalId ?? '',
      identityCertificateNo: file.user.identityCertificateNo ?? '',
      trackingCode: file.trackingCode ?? '',
      jobTitle: file.activityJob?.title ?? '',
      jobGroup: file.activityJob?.group?.title ?? '',
      unitTitle: file.businessUnitTitle ?? '',
      address: file.premiseAddress ?? '',
      phone: file.user.phone ?? '',
      date: issued.issuedAt,
      letterNo: issued.letterNo,
      centerName: letter.centerName,
    };
    return {
      id: letter.id,
      centerName: letter.centerName,
      centerPhone: letter.centerPhone,
      nationalId: file.user.nationalId,
      letterNo: issued.letterNo,
      issuedAt: issued.issuedAt,
      letterhead: issued.letterhead,
      letterTitle: letter.letterTitle,
      letterBody: letter.letterBody,
      fields,
    };
  }

  async addProcessFile(
    caseFileId: string,
    upload: { buffer: Buffer; mimeType: string; originalName: string },
    actorId?: string,
  ) {
    const process = await this.requireProcess(caseFileId);
    await this.assertMutable(caseFileId);
    const fileId = randomUUID();
    const stored = await this.files.saveRevocationProcess({
      personId: (await this.ownerId(caseFileId)) ?? caseFileId,
      caseFileId,
      fileId,
      buffer: upload.buffer,
      mimeType: upload.mimeType,
      originalName: upload.originalName,
    });
    try {
      await this.prisma.caseRevocationProcessFile.create({
        data: {
          id: fileId,
          processId: process.id,
          storageKey: stored.storageKey,
          originalName: stored.originalName,
          mimeType: stored.mimeType,
          byteSize: stored.byteSize,
          uploadedById: actorId ?? null,
        },
      });
    } catch (error) {
      await this.files.remove(stored.storageKey);
      throw error;
    }
    return this.state(caseFileId);
  }

  async removeProcessFile(caseFileId: string, fileId: string) {
    await this.assertMutable(caseFileId);
    const file = await this.prisma.caseRevocationProcessFile.findFirst({
      where: { id: fileId, process: { caseFileId } },
    });
    if (!file) throw new NotFoundException('پیوست یافت نشد');
    await this.prisma.caseRevocationProcessFile.delete({ where: { id: file.id } });
    await this.files.remove(file.storageKey);
    return this.state(caseFileId);
  }

  async readProcessFile(caseFileId: string, fileId: string) {
    const file = await this.prisma.caseRevocationProcessFile.findFirst({
      where: { id: fileId, process: { caseFileId } },
    });
    if (!file) throw new NotFoundException('پیوست یافت نشد');
    return {
      mimeType: file.mimeType,
      byteSize: file.byteSize,
      originalName: file.originalName,
      data: await this.files.read(file.storageKey),
    };
  }

  async readRequestFile(caseFileId: string, fileId: string) {
    const file = await this.prisma.caseRevocationRequestFile.findFirst({
      where: { id: fileId, request: { request: { caseFileId } } },
    });
    if (!file) throw new NotFoundException('پیوست یافت نشد');
    return {
      mimeType: file.mimeType,
      byteSize: file.byteSize,
      originalName: file.originalName,
      data: await this.files.read(file.storageKey),
    };
  }

  async complete(
    caseFileId: string,
    dto: CompleteCaseRevocationDto,
    actorId?: string,
  ) {
    const process = await this.requireProcess(caseFileId);
    await this.assertMutable(caseFileId);
    const revokedAt = parseDateOnly(dto.revokedAt);
    const tomorrow = new Date();
    tomorrow.setHours(23, 59, 59, 999);
    if (revokedAt > tomorrow) {
      throw new BadRequestException('تاریخ ابطال نمی‌تواند در آینده باشد');
    }
    await this.prisma.caseRevocationProcess.update({
      where: { id: process.id },
      data: { revocationDate: revokedAt },
    });
    const result = await this.cases.revoke(caseFileId, { reason: dto.reason }, actorId, revokedAt);
    await this.prisma.caseRequest.updateMany({
      where: {
        caseFileId,
        type: CaseRequestType.REVOCATION,
        status: { in: [CaseRequestStatus.OPEN, CaseRequestStatus.ISSUED] },
      },
      data: { status: CaseRequestStatus.COMPLETED, completedAt: new Date() },
    });
    return result;
  }

  private async ensure(caseFileId: string, requestId?: string | null) {
    const existing = await this.prisma.caseRevocationProcess.findUnique({
      where: { caseFileId },
      include: {
        letters: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] },
        files: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
      },
    });
    if (existing) {
      if (requestId && !existing.requestId) {
        await this.prisma.caseRevocationProcess.update({
          where: { id: existing.id },
          data: { requestId },
        });
        return { ...existing, requestId };
      }
      return existing;
    }
    await this.assertMutable(caseFileId);
    const settings = await this.prisma.caseRevocationSettings.findUnique({
      where: { id: SETTINGS_ID },
      include: {
        organizations: {
          orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
          include: {
            inquiryCenter: { select: { name: true, phone: true } },
          },
        },
      },
    });
    if (!settings?.fixedAmount) {
      throw new BadRequestException('مبلغ ثابت ابطال در تنظیمات مشخص نشده است');
    }
    try {
      return await this.prisma.caseRevocationProcess.create({
        data: {
          caseFileId,
          requestId: requestId ?? undefined,
          amount: settings.fixedAmount,
          letters: {
            create: settings.organizations.map((organization, index) => ({
              inquiryCenterId: organization.inquiryCenterId,
              centerName: organization.inquiryCenter.name,
              centerPhone: organization.inquiryCenter.phone,
              letterTitle: organization.letterTitle?.trim() || `اعلام ابطال مجوز`,
              letterBody: organization.letterBody?.trim() || '',
              sortOrder: index,
            })),
          },
        },
        include: {
          letters: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] },
          files: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
        },
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
        throw error;
      }
      const raced = await this.prisma.caseRevocationProcess.findUnique({
        where: { caseFileId },
        include: {
          letters: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] },
          files: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
        },
      });
      if (!raced) throw error;
      return raced;
    }
  }

  private async requireProcess(caseFileId: string) {
    const process = await this.prisma.caseRevocationProcess.findUnique({
      where: { caseFileId },
      select: { id: true },
    });
    if (!process) throw new BadRequestException('فرایند ابطال هنوز شروع نشده است');
    return process;
  }

  private async canStartProcess(
    caseFileId: string,
    request: Awaited<ReturnType<CaseRevocationProcessService['latestRequest']>>,
  ) {
    if (!request) return true;
    if (request.status === CaseRequestStatus.REJECTED || request.status === CaseRequestStatus.CANCELLED) {
      return false;
    }
    if (request.status === CaseRequestStatus.ISSUED || request.status === CaseRequestStatus.COMPLETED) {
      return true;
    }
    return this.requestReady(request);
  }

  private requestReady(request: {
    status: CaseRequestStatus;
    managementReviews: { status: CaseInquiryStatus; roleId: string }[];
    configuredRoleIds?: string[];
  }) {
    if (request.status === CaseRequestStatus.REJECTED || request.status === CaseRequestStatus.CANCELLED) {
      return false;
    }
    if (request.managementReviews.some((row) => row.status === CaseInquiryStatus.REJECTED)) {
      return false;
    }
    const roleIds = request.configuredRoleIds ?? [];
    if (!roleIds.length) return request.managementReviews.length === 0;
    return (
      roleIds.every((roleId) =>
        request.managementReviews.some(
          (row) => row.roleId === roleId && row.status === CaseInquiryStatus.APPROVED,
        ),
      )
    );
  }

  private async latestRequest(caseFileId: string) {
    const request = await this.prisma.caseRequest.findFirst({
      where: { caseFileId, type: CaseRequestType.REVOCATION },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      include: {
        revocation: {
          include: { files: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] } },
        },
        managementReviews: { select: { status: true, roleId: true } },
      },
    });
    if (!request) return null;
    const titles = await processManagementTitles(this.prisma, CaseRequestType.REVOCATION);
    return { ...request, configuredRoleIds: titles.map((item) => item.roleId) };
  }

  private async markIssued(requestId: string, processId: string) {
    await this.prisma.$transaction([
      this.prisma.caseRequest.updateMany({
        where: { id: requestId, status: CaseRequestStatus.OPEN },
        data: { status: CaseRequestStatus.ISSUED },
      }),
      this.prisma.caseRevocationProcess.updateMany({
        where: { id: processId, requestId: null },
        data: { requestId },
      }),
    ]);
  }

  private async markRejected(requestId: string) {
    await this.prisma.caseRequest.updateMany({
      where: { id: requestId, status: CaseRequestStatus.OPEN },
      data: { status: CaseRequestStatus.REJECTED, completedAt: new Date() },
    });
  }

  private async assertMutable(caseFileId: string) {
    const file = await this.prisma.caseFile.findUnique({
      where: { id: caseFileId },
      select: {
        id: true,
        kind: true,
        status: true,
        formationStep: true,
        licenseNumber: true,
      },
    });
    if (!file || file.kind !== CaseFileKind.LICENSE || file.formationStep < 1) {
      throw new NotFoundException('پرونده یافت نشد');
    }
    if (!file.licenseNumber) throw new BadRequestException('مجوز فعالیت اقتصادی هنوز صادر نشده است');
    if (file.status === CaseFileStatus.REVOKED) {
      throw new BadRequestException('این پرونده قبلاً ابطال شده است');
    }
  }

  private async ownerId(caseFileId: string) {
    const row = await this.prisma.caseFile.findUnique({
      where: { id: caseFileId },
      select: { userId: true },
    });
    return row?.userId ?? null;
  }

  private mapFile(item: StoredFile) {
    return {
      id: item.id,
      originalName: item.originalName,
      mimeType: item.mimeType,
      byteSize: item.byteSize,
      createdAt: item.createdAt.toISOString(),
    };
  }

  private async caseSubject(caseFileId: string) {
    const file = await this.prisma.caseFile.findUnique({
      where: { id: caseFileId },
      select: {
        id: true,
        status: true,
        trackingCode: true,
        businessUnitTitle: true,
        licenseNumber: true,
        licenseIssuedAt: true,
        premiseAddress: true,
        activityJob: { select: { title: true, group: { select: { title: true } } } },
        user: {
          select: {
            fullName: true,
            nationalId: true,
            identityCertificateNo: true,
            phone: true,
          },
        },
      },
    });
    if (!file) throw new NotFoundException('پرونده یافت نشد');
    return file;
  }
}
