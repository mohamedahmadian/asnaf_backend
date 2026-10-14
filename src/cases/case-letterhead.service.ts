import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { toLatinDigits } from '../common/national-id';
import { PrismaService } from '../prisma/prisma.service';
import { SaveCaseLetterheadDto } from './dto/save-case-letterhead.dto';

const SETTINGS_ID = 'default';

const IMAGE_USE = {
  photoUsers: true,
  foodPhotos: true,
  restaurantLogos: true,
  progressImages: true,
  singardAttachments: true,
  boardAttachments: true,
  boardMinutesAttachments: true,
  violationAttachments: true,
  violationProceedingAttachments: true,
  letterheadLogos: true,
  letterheadSignatures: true,
} satisfies Prisma.StoredImageCountOutputTypeSelect;

type LetterTarget = 'inquiry' | 'places';

function jalaliYear(date = new Date()) {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  if (month < 3 || (month === 3 && day < 21)) return year - 622;
  return year - 621;
}

function dateOnlyNoon(iso: string) {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1, 12, 0, 0, 0);
}

function localIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dataUrl(image: { mimeType: string; data: Uint8Array }) {
  const mime = image.mimeType === 'image/png' ? 'image/png' : 'image/jpeg';
  return `data:${mime};base64,${Buffer.from(image.data).toString('base64')}`;
}

@Injectable()
export class CaseLetterheadService {
  constructor(private readonly prisma: PrismaService) {}

  async get() {
    const row = await this.ensure();
    return this.present(row);
  }

  async save(dto: SaveCaseLetterheadDto) {
    const current = await this.ensure();
    const logoId = dto.logoId === undefined ? current.logoId : dto.logoId;
    const signatureId = dto.signatureId === undefined ? current.signatureId : dto.signatureId;
    if (logoId && logoId === signatureId) {
      throw new BadRequestException('لوگو و امضا باید دو تصویر جدا باشند');
    }
    await this.assertLetterImage(logoId, current);
    await this.assertLetterImage(signatureId, current);
    const phone = dto.phone ? toLatinDigits(dto.phone).replace(/[^\d+\-() ]/g, '').trim() || null : null;
    await this.prisma.caseLetterhead.update({
      where: { id: SETTINGS_ID },
      data: {
        organizationName: dto.organizationName ?? null,
        address: dto.address ?? null,
        phone,
        website: dto.website ?? null,
        signerName: dto.signerName ?? null,
        signerTitle: dto.signerTitle ?? null,
        logoId,
        signatureId,
      },
    });
    const stale = [current.logoId, current.signatureId].filter(
      (id): id is string => Boolean(id) && id !== logoId && id !== signatureId,
    );
    for (const id of [...new Set(stale)]) {
      await this.deleteIfUnused(id);
    }
    return this.get();
  }

  view() {
    return this.forLetter();
  }

  /** شماره و تاریخ را بار اول ثابت می‌کند و سربرگ فعلی را برای چاپ برمی‌گرداند. */
  async openLetter(target: LetterTarget, id: string) {
    const issued = await this.issue(target, id);
    const letterhead = await this.forLetter();
    return {
      letterNo: issued.letterNo,
      issuedAt: localIsoDate(issued.issuedAt),
      letterhead,
    };
  }

  async updateIssue(target: LetterTarget, id: string, input: { letterNo: string; issuedAt: string }) {
    const letterNo = toLatinDigits(input.letterNo).trim().replace(/\s+/g, ' ');
    if (!letterNo || letterNo.length > 40) {
      throw new BadRequestException('شماره نامه معتبر نیست');
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.issuedAt)) {
      throw new BadRequestException('تاریخ صدور معتبر نیست');
    }
    const issuedAt = dateOnlyNoon(input.issuedAt);
    const [inquiryTaken, placesTaken] = await Promise.all([
      this.prisma.caseInquiry.findFirst({
        where: {
          letterNo,
          ...(target === 'inquiry' ? { NOT: { id } } : {}),
        },
        select: { id: true },
      }),
      this.prisma.casePlacesReview.findFirst({
        where: {
          letterNo,
          ...(target === 'places' ? { NOT: { id } } : {}),
        },
        select: { id: true },
      }),
    ]);
    if (inquiryTaken || placesTaken) {
      throw new BadRequestException('این شماره نامه قبلاً استفاده شده است');
    }
    try {
      await this.writeIssue(this.prisma, target, id, { letterNo, issuedAt });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new BadRequestException('این شماره نامه قبلاً استفاده شده است');
      }
      throw error;
    }
    return { letterNo, issuedAt: input.issuedAt };
  }

  private present(row: {
    organizationName: string | null;
    address: string | null;
    phone: string | null;
    website: string | null;
    signerName: string | null;
    signerTitle: string | null;
    logoId: string | null;
    signatureId: string | null;
  }) {
    return {
      organizationName: row.organizationName,
      address: row.address,
      phone: row.phone,
      website: row.website,
      signerName: row.signerName,
      signerTitle: row.signerTitle,
      logoId: row.logoId,
      signatureId: row.signatureId,
    };
  }

  private async forLetter() {
    const row = await this.prisma.caseLetterhead.findUnique({
      where: { id: SETTINGS_ID },
      include: { logo: true, signature: true },
    });
    if (!row) {
      return {
        organizationName: null,
        address: null,
        phone: null,
        website: null,
        signerName: null,
        signerTitle: null,
        logoDataUrl: null,
        signatureDataUrl: null,
      };
    }
    return {
      organizationName: row.organizationName,
      address: row.address,
      phone: row.phone,
      website: row.website,
      signerName: row.signerName,
      signerTitle: row.signerTitle,
      logoDataUrl: row.logo ? dataUrl(row.logo) : null,
      signatureDataUrl: row.signature ? dataUrl(row.signature) : null,
    };
  }

  private async issue(target: LetterTarget, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const current =
        target === 'inquiry'
          ? await tx.caseInquiry.findUnique({
              where: { id },
              select: { letterNo: true, issuedAt: true },
            })
          : await tx.casePlacesReview.findUnique({
              where: { id },
              select: { letterNo: true, issuedAt: true },
            });
      if (!current) throw new NotFoundException('نامه یافت نشد');
      if (current.letterNo && current.issuedAt) {
        return { letterNo: current.letterNo, issuedAt: current.issuedAt };
      }
      if (current.letterNo) {
        const issuedAt = new Date();
        await this.writeIssue(tx, target, id, { issuedAt });
        return { letterNo: current.letterNo, issuedAt };
      }
      await tx.caseLetterhead.upsert({
        where: { id: SETTINGS_ID },
        create: { id: SETTINGS_ID },
        update: {},
      });
      await tx.$queryRaw`SELECT id FROM case_letterheads WHERE id = ${SETTINGS_ID} FOR UPDATE`;
      const issuedAt = new Date();
      const year = jalaliYear(issuedAt);
      for (let attempt = 0; attempt < 30; attempt += 1) {
        const bumped = await tx.caseLetterhead.update({
          where: { id: SETTINGS_ID },
          data: { nextNumber: { increment: 1 } },
          select: { nextNumber: true },
        });
        const letterNo = `${year}/${String(bumped.nextNumber - 1).padStart(6, '0')}`;
        if (await this.letterNoTaken(tx, letterNo)) continue;
        try {
          await this.writeIssue(tx, target, id, { letterNo, issuedAt });
          return { letterNo, issuedAt };
        } catch (error) {
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') continue;
          throw error;
        }
      }
      throw new BadRequestException('شماره نامه صادر نشد');
    });
  }

  private async letterNoTaken(tx: Prisma.TransactionClient, letterNo: string) {
    const [inquiry, places] = await Promise.all([
      tx.caseInquiry.findFirst({ where: { letterNo }, select: { id: true } }),
      tx.casePlacesReview.findFirst({ where: { letterNo }, select: { id: true } }),
    ]);
    return Boolean(inquiry || places);
  }

  private writeIssue(
    tx: Prisma.TransactionClient | PrismaService,
    target: LetterTarget,
    id: string,
    data: { letterNo?: string; issuedAt: Date },
  ) {
    if (target === 'inquiry') {
      return tx.caseInquiry.update({ where: { id }, data });
    }
    return tx.casePlacesReview.update({ where: { id }, data });
  }

  private ensure() {
    return this.prisma.caseLetterhead.upsert({
      where: { id: SETTINGS_ID },
      create: { id: SETTINGS_ID },
      update: {},
    });
  }

  private async assertLetterImage(
    id: string | null,
    current: { logoId: string | null; signatureId: string | null },
  ) {
    if (!id || id === current.logoId || id === current.signatureId) return;
    const image = await this.prisma.storedImage.findUnique({
      where: { id },
      select: { id: true, _count: { select: IMAGE_USE } },
    });
    if (!image) throw new NotFoundException('تصویر یافت نشد');
    const used = Object.values(image._count).some((count) => count > 0);
    if (used) throw new BadRequestException('این تصویر برای سربرگ نامه قابل استفاده نیست');
  }

  private async deleteIfUnused(id: string) {
    const image = await this.prisma.storedImage.findUnique({
      where: { id },
      select: { id: true, _count: { select: IMAGE_USE } },
    });
    if (!image) return;
    const used = Object.values(image._count).some((count) => count > 0);
    if (!used) await this.prisma.storedImage.delete({ where: { id } });
  }
}
