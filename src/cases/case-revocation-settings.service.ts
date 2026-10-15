import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SaveCaseRevocationSettingsDto } from './dto/save-case-revocation-settings.dto';

const SETTINGS_ID = 'default';

function toAmountNumber(value: Prisma.Decimal | number | null) {
  if (value == null) return null;
  return typeof value === 'number' ? value : Number(value);
}

@Injectable()
export class CaseRevocationSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async get() {
    const row = await this.ensure();
    return {
      fixedAmount: toAmountNumber(row.fixedAmount),
      organizations: row.organizations.map((item) => ({
        inquiryCenterId: item.inquiryCenterId,
        name: item.inquiryCenter.name,
        isActive: item.inquiryCenter.isActive,
        letterTitle: item.letterTitle,
        letterBody: item.letterBody,
      })),
    };
  }

  async save(dto: SaveCaseRevocationSettingsDto) {
    const ids = dto.organizations.map((item) => item.inquiryCenterId);
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException('سازمان تکراری در فهرست است');
    }
    if (ids.length) {
      const found = await this.prisma.inquiryCenter.findMany({
        where: { id: { in: ids } },
        select: { id: true },
      });
      if (found.length !== ids.length) throw new NotFoundException('سازمان یافت نشد');
    }
    const fixedAmount = new Prisma.Decimal(dto.fixedAmount);
    await this.prisma.$transaction(async (tx) => {
      await tx.caseRevocationSettings.upsert({
        where: { id: SETTINGS_ID },
        create: { id: SETTINGS_ID, fixedAmount },
        update: { fixedAmount },
      });
      await tx.caseRevocationOrganization.deleteMany({ where: { settingsId: SETTINGS_ID } });
      if (dto.organizations.length) {
        await tx.caseRevocationOrganization.createMany({
          data: dto.organizations.map((item, index) => ({
            settingsId: SETTINGS_ID,
            inquiryCenterId: item.inquiryCenterId,
            letterTitle: item.letterTitle.trim(),
            letterBody: item.letterBody.trim(),
            sortOrder: index,
          })),
        });
      }
    });
    return this.get();
  }

  private ensure() {
    return this.prisma.caseRevocationSettings.upsert({
      where: { id: SETTINGS_ID },
      create: { id: SETTINGS_ID },
      update: {},
      include: {
        organizations: {
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
          include: { inquiryCenter: { select: { name: true, isActive: true } } },
        },
      },
    });
  }
}
