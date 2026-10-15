import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CaseFileKind, CaseFileStatus, CaseRequestType, Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CaseLetterheadService } from './case-letterhead.service';
import { CasesService } from './cases.service';
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

@Injectable()
export class CaseRevocationProcessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly letterhead: CaseLetterheadService,
    private readonly cases: CasesService,
  ) {}

  async state(caseFileId: string) {
    const process = await this.ensure(caseFileId);
    const file = await this.caseSubject(caseFileId);
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
      id: process.id,
      amount: Number(process.amount),
      revocationDate: dateOnly(process.revocationDate),
      status: file.status,
      case: {
        id: file.id,
        businessUnitTitle: file.businessUnitTitle,
        licenseNumber: file.licenseNumber,
        firstIssuedAt: dateOnly(firstRenewal?.renewalTerms?.currentIssuedAt ?? file.licenseIssuedAt),
        fullName: file.user.fullName,
        nationalId: file.user.nationalId,
        jobTitle: file.activityJob?.title ?? null,
      },
      letters: process.letters.map((letter) => ({
        id: letter.id,
        centerName: letter.centerName,
        letterNo: letter.letterNo,
        issuedAt: dateOnly(letter.issuedAt),
      })),
    };
  }

  async saveAmount(caseFileId: string, dto: SaveCaseRevocationAmountDto) {
    const process = await this.ensure(caseFileId);
    await this.assertMutable(caseFileId);
    await this.prisma.caseRevocationProcess.update({
      where: { id: process.id },
      data: { amount: new Prisma.Decimal(dto.amount) },
    });
    return this.state(caseFileId);
  }

  async letter(caseFileId: string, letterId: string) {
    await this.ensure(caseFileId);
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

  async complete(
    caseFileId: string,
    dto: CompleteCaseRevocationDto,
    actorId?: string,
  ) {
    const process = await this.ensure(caseFileId);
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
    return this.cases.revoke(caseFileId, { reason: dto.reason }, actorId, revokedAt);
  }

  private async ensure(caseFileId: string) {
    const existing = await this.prisma.caseRevocationProcess.findUnique({
      where: { caseFileId },
      include: { letters: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] } },
    });
    if (existing) return existing;
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
        include: { letters: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] } },
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
        throw error;
      }
      const raced = await this.prisma.caseRevocationProcess.findUnique({
        where: { caseFileId },
        include: { letters: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] } },
      });
      if (!raced) throw error;
      return raced;
    }
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
