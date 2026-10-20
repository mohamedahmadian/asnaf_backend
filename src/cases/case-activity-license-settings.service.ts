import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SaveCaseActivityLicenseSettingsDto } from './dto/save-case-activity-license-settings.dto';

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
  activityLicenseSignatures: true,
} satisfies Prisma.StoredImageCountOutputTypeSelect;

@Injectable()
export class CaseActivityLicenseSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async get() {
    const row = await this.ensure();
    return this.present(row);
  }

  async save(dto: SaveCaseActivityLicenseSettingsDto) {
    const current = await this.ensure();
    const signatureId = dto.signatureId === undefined ? current.signatureId : dto.signatureId;
    await this.assertImage(signatureId, current.signatureId);
    await this.prisma.caseActivityLicenseSettings.update({
      where: { id: SETTINGS_ID },
      data: {
        signerName: dto.signerName ?? null,
        signerTitle: dto.signerTitle ?? null,
        signatureId,
      },
    });
    if (current.signatureId && current.signatureId !== signatureId) {
      await this.deleteIfUnused(current.signatureId);
    }
    return this.get();
  }

  private present(row: { signerName: string | null; signerTitle: string | null; signatureId: string | null }) {
    return {
      signerName: row.signerName,
      signerTitle: row.signerTitle,
      signatureId: row.signatureId,
    };
  }

  private ensure() {
    return this.prisma.caseActivityLicenseSettings.upsert({
      where: { id: SETTINGS_ID },
      create: { id: SETTINGS_ID },
      update: {},
    });
  }

  private async assertImage(id: string | null, currentId: string | null) {
    if (!id || id === currentId) return;
    const image = await this.prisma.storedImage.findUnique({
      where: { id },
      select: { id: true, _count: { select: IMAGE_USE } },
    });
    if (!image) throw new NotFoundException('تصویر یافت نشد');
    const used = Object.values(image._count).some((count) => count > 0);
    if (used) throw new BadRequestException('این تصویر برای امضای مجوز قابل استفاده نیست');
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
