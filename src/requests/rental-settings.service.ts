import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  containsInsensitive,
  paginatedResult,
  paginationArgs,
} from '../common/pagination';
import { resolveSortOrder } from '../common/sort-query';
import { DocumentGender, Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PERSONNEL_PHOTO_CODE } from '../cases/personnel-photo';
import { clampContractYears } from '../cases/contract-duration';
import {
  CreateRentalIdentityDocumentDto,
  CreateRentalProcessRoleDto,
  FindRentalIdentityDocumentsQueryDto,
  SaveRentalDocumentsDto,
  SaveRentalLicenseSettingsDto,
} from './dto/save-rental-settings.dto';

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
  rentalLicenseSignatures: true,
} satisfies Prisma.StoredImageCountOutputTypeSelect;

@Injectable()
export class RentalSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getLicenseSettings() {
    const row = await this.ensureSettings();
    return {
      contractYears: clampContractYears(row.contractYears),
      signerName: row.signerName,
      signerTitle: row.signerTitle,
      signatureId: row.signatureId,
    };
  }

  async saveLicenseSettings(dto: SaveRentalLicenseSettingsDto) {
    const current = await this.ensureSettings();
    const signatureId = dto.signatureId === undefined ? current.signatureId : dto.signatureId;
    await this.assertImage(signatureId, current.signatureId);
    await this.prisma.rentalLicenseSettings.update({
      where: { id: SETTINGS_ID },
      data: {
        contractYears:
          dto.contractYears === undefined
            ? current.contractYears
            : clampContractYears(dto.contractYears),
        signerName: dto.signerName === undefined ? current.signerName : dto.signerName,
        signerTitle: dto.signerTitle === undefined ? current.signerTitle : dto.signerTitle,
        signatureId,
      },
    });
    if (current.signatureId && current.signatureId !== signatureId) {
      await this.deleteIfUnused(current.signatureId);
    }
    return this.getLicenseSettings();
  }

  async findIdentityDocuments(query: FindRentalIdentityDocumentsQueryDto) {
    const where: Prisma.RentalIdentityDocumentWhereInput = {
      document: {
        ...(query.q ? { title: containsInsensitive(query.q) } : {}),
        NOT: { code: PERSONNEL_PHOTO_CODE },
      },
    };
    const orderBy = resolveSortOrder<Prisma.RentalIdentityDocumentOrderByWithRelationInput>(
      query.sortBy,
      query.sortDir,
      {
        title: (dir) => ({ document: { title: dir } }),
        isRequired: (dir) => ({ isRequired: dir }),
        gender: (dir) => ({ gender: dir }),
      },
      [{ createdAt: 'desc' }, { documentId: 'asc' }],
    );
    const { page, pageSize, skip, take } = paginationArgs(query);
    const [rows, total] = await Promise.all([
      this.prisma.rentalIdentityDocument.findMany({
        where,
        orderBy,
        skip,
        take,
        select: {
          documentId: true,
          gender: true,
          isRequired: true,
          createdAt: true,
          document: { select: { title: true } },
        },
      }),
      this.prisma.rentalIdentityDocument.count({ where }),
    ]);
    return paginatedResult(
      rows.map((row) => ({
        documentId: row.documentId,
        title: row.document.title,
        isRequired: row.isRequired,
        gender: row.gender,
        createdAt: row.createdAt,
      })),
      total,
      page,
      pageSize,
    );
  }

  identityDocumentOptions() {
    return this.prisma.document.findMany({
      where: {
        rentalIdentityDocument: null,
        NOT: { code: PERSONNEL_PHOTO_CODE },
      },
      orderBy: { title: 'asc' },
      select: { id: true, title: true },
    });
  }

  async addIdentityDocument(dto: CreateRentalIdentityDocumentDto) {
    const document = await this.prisma.document.findUnique({
      where: { id: dto.documentId },
      select: { id: true, code: true },
    });
    if (!document || document.code === PERSONNEL_PHOTO_CODE) {
      throw new NotFoundException('مدرک یافت نشد');
    }
    try {
      await this.prisma.rentalIdentityDocument.create({
        data: {
          documentId: dto.documentId,
          gender: dto.gender,
          isRequired: dto.isRequired,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('این مدرک قبلاً اضافه شده است');
      }
      throw error;
    }
    return { ok: true };
  }

  async removeIdentityDocument(documentId: string) {
    try {
      await this.prisma.rentalIdentityDocument.delete({ where: { documentId } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new NotFoundException('این مدرک در فهرست نیست');
      }
      throw error;
    }
    return { ok: true };
  }

  async getDocuments() {
    const rows = await this.prisma.rentalDocumentRequirement.findMany({
      orderBy: { document: { title: 'asc' } },
      select: {
        gender: true,
        isRequired: true,
        document: { select: { id: true, title: true } },
      },
    });
    return {
      documents: rows.map((row) => ({
        id: row.document.id,
        title: row.document.title,
        gender: row.gender,
        isRequired: row.isRequired,
      })),
    };
  }

  async saveDocuments(dto: SaveRentalDocumentsDto) {
    const documents = new Map<string, { gender: DocumentGender; isRequired: boolean }>();
    for (const item of dto.documents) {
      documents.set(item.documentId, { gender: item.gender, isRequired: item.isRequired });
    }
    const found = await this.prisma.document.findMany({
      where: { id: { in: [...documents.keys()] } },
      select: { id: true },
    });
    if (found.length !== documents.size) throw new BadRequestException('مدرک یافت نشد');
    await this.prisma.$transaction(async (tx) => {
      await tx.rentalDocumentRequirement.deleteMany();
      if (documents.size) {
        await tx.rentalDocumentRequirement.createMany({
          data: [...documents.entries()].map(([documentId, item]) => ({
            documentId,
            gender: item.gender,
            isRequired: item.isRequired,
          })),
        });
      }
    });
    return this.getDocuments();
  }

  async listProcessRoles() {
    const rows = await this.prisma.rentalProcessManagementRole.findMany({
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        roleId: true,
        title: true,
        role: { select: { name: true } },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      roleId: row.roleId,
      roleName: row.role.name,
      title: row.title,
    }));
  }

  async addProcessRole(dto: CreateRentalProcessRoleDto) {
    const title = dto.title.trim();
    if (!title) throw new BadRequestException('عنوان را وارد کنید');
    const role = await this.prisma.role.findUnique({
      where: { id: dto.roleId },
      select: { id: true },
    });
    if (!role) throw new NotFoundException('نقش یافت نشد');
    try {
      await this.prisma.rentalProcessManagementRole.create({
        data: { roleId: dto.roleId, title },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('این نقش قبلاً ثبت شده است');
      }
      throw error;
    }
    return { ok: true };
  }

  async removeProcessRole(id: string) {
    try {
      await this.prisma.rentalProcessManagementRole.delete({ where: { id } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new NotFoundException('این مورد در فهرست نیست');
      }
      throw error;
    }
    return { ok: true };
  }

  private ensureSettings() {
    return this.prisma.rentalLicenseSettings.upsert({
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
