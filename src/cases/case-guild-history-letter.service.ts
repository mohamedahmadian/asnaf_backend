import { Injectable, NotFoundException } from '@nestjs/common';
import { CaseFileKind } from '../generated/prisma/client';
import { todayIsoDateTehran } from '../common/iso-date';
import { PrismaService } from '../prisma/prisma.service';
import { CaseLetterheadService } from './case-letterhead.service';
import { syncCaseStatus } from './case-status';

const LETTER_TITLE = 'گواهی سابقه صنفی';
const LETTER_BODY =
  'احتراما بدینوسیله گواهی می‌شود {{fullName}}، به شماره ملی {{nationalId}} متصدی صنفی {{jobTitle}} واقع در {{address}} به شرح ذیل می‌باشد';
const NOTICE = 'بدون مهر، فاقد اعتبار می‌باشد';

function dateOnly(value: Date | null | undefined) {
  return value ? value.toISOString().slice(0, 10) : '';
}

function formatAddress(file: {
  premiseAddress: string | null;
  premisePlaque: string | null;
  premiseCity: { nameFa: string } | null;
}) {
  return [
    file.premiseCity?.nameFa,
    file.premiseAddress,
    file.premisePlaque ? `پلاک ${file.premisePlaque}` : '',
  ]
    .filter(Boolean)
    .join('، ');
}

@Injectable()
export class CaseGuildHistoryLetterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly letterhead: CaseLetterheadService,
  ) {}

  async letters(caseFileId: string) {
    const file = await this.prisma.caseFile.findUnique({
      where: { id: caseFileId },
      select: {
        id: true,
        kind: true,
        formationStep: true,
        status: true,
        trackingCode: true,
        businessUnitTitle: true,
        licenseNumber: true,
        licenseIssuedAt: true,
        licenseExpiresAt: true,
        premiseAddress: true,
        premisePlaque: true,
        premiseCity: { select: { nameFa: true } },
        activityJob: {
          select: { title: true, group: { select: { title: true } } },
        },
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
    if (
      !file ||
      (file.formationStep < 1 && file.kind !== CaseFileKind.STEWARDSHIP)
    ) {
      throw new NotFoundException('پرونده یافت نشد');
    }
    const status = (await syncCaseStatus(this.prisma, file.id)) ?? file.status;
    const letterhead = await this.letterhead.view();
    const issuedAt = todayIsoDateTehran();
    const fields = {
      fullName: file.user.fullName,
      nationalId: file.user.nationalId ?? '',
      identityCertificateNo: file.user.identityCertificateNo ?? '',
      trackingCode: file.trackingCode ?? '',
      jobTitle: file.activityJob?.title ?? '',
      jobGroup: file.activityJob?.group?.title ?? '',
      unitTitle: file.businessUnitTitle ?? '',
      address: formatAddress(file),
      phone: file.user.phone ?? '',
      date: issuedAt,
      letterNo: '',
    };
    const license = {
      number: file.licenseNumber ?? '',
      issuedAt: dateOnly(file.licenseIssuedAt),
      expiresAt: dateOnly(file.licenseExpiresAt),
      status,
    };
    return {
      id: file.id,
      centerName: '',
      centerPhone: null,
      nationalId: file.user.nationalId,
      letterNo: '',
      issuedAt,
      letterhead,
      letterTitle: LETTER_TITLE,
      letterBody: LETTER_BODY,
      fields: { ...fields, centerName: '' },
      extras: { recipient: '', notice: NOTICE, license },
    };
  }
}
