import { randomUUID } from 'crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { ensureEconomicActorRole } from '../access/access.constants';
import { clampContractYears } from '../cases/contract-duration';
import { PERSONNEL_PHOTO_CODE } from '../cases/personnel-photo';
import { PersonFileStorage } from '../cases/person-file.storage';
import { todayIsoDateTehran } from '../common/iso-date';
import { normalizeNationalId } from '../common/national-id';
import { containsInsensitive, paginatedResult, paginationArgs } from '../common/pagination';
import { normalizeMobile } from '../common/phone';
import { resolveSortOrder } from '../common/sort-query';
import { SaveCaseIdentityDto } from '../cases/dto/save-case-identity.dto';
import {
  CaseInquiryChannel,
  CaseInquiryStatus,
  CasePremiseFileKind,
  DocumentSource,
  PremiseEstablishment,
  PremiseGeoPosition,
  PremiseOwnership,
  PremisePublicAccess,
  Prisma,
  RentalLicenseStatus,
  RentalRequestStatus,
  RentalRequestType,
  UserStatus,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { joinFullName } from '../users/user-profile.util';
import { FindRentalLicensesQueryDto } from './dto/find-rental-licenses-query.dto';
import { SaveRentalLocationDto } from './dto/save-rental-location.dto';
import { SaveRentalStepDto } from './dto/save-rental-step.dto';
import { RentalSettingsService } from './rental-settings.service';

const ECONOMIC_ACTOR_INITIAL_PASSWORD = '11111111';
export const RENTAL_IDENTITY_STEP = 0;
export const RENTAL_LOCATION_STEP = 1;
export const RENTAL_MANAGEMENT_STEP = 2;
export const RENTAL_ISSUANCE_STEP = 3;

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
  country: { select: { id: true, nameFa: true, nameEn: true } },
  economicJob: { select: { id: true, title: true, groupId: true } },
} satisfies Prisma.UserSelect;

const licenseSelect = {
  id: true,
  userId: true,
  status: true,
  formationStep: true,
  trackingCode: true,
  licenseNumber: true,
  licenseIssuedAt: true,
  firstIssuedAt: true,
  licenseExpiresAt: true,
  premiseCityId: true,
  premiseEstablishment: true,
  premiseComplexId: true,
  premiseAddress: true,
  premiseAddressEn: true,
  urbanZoneId: true,
  premisePlaque: true,
  premisePlaqueSeries: true,
  premiseFloor: true,
  premiseUnitNo: true,
  premisePostalCode: true,
  premisePhone: true,
  premiseFax: true,
  premiseGeoPosition: true,
  premisePublicAccess: true,
  registrationPlaceId: true,
  premiseOwnership: true,
  premiseDeedNo: true,
  premiseArea: true,
  leaseIssuedAt: true,
  leaseExpiresAt: true,
  leaseAgency: true,
  premiseOwnerName: true,
  premiseOwnerNationalId: true,
  premiseFiles: {
    orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }],
    select: {
      id: true,
      kind: true,
      originalName: true,
      mimeType: true,
      byteSize: true,
    },
  },
  requests: {
    where: { status: RentalRequestStatus.OPEN },
    orderBy: [{ createdAt: 'desc' as const }, { id: 'desc' as const }],
    take: 1,
    select: { id: true, type: true, intakeSubmittedAt: true, status: true, formationStep: true },
  },
} satisfies Prisma.RentalLicenseSelect;

type PersonRow = Prisma.UserGetPayload<{ select: typeof personSelect }>;
type LicenseRow = Prisma.RentalLicenseGetPayload<{ select: typeof licenseSelect }>;

export type RentalActor = {
  id: string;
  isAdmin?: boolean;
  permissionCodes?: string[];
  roleIds?: string[];
};

function dateOnly(value: Date | null) {
  return value ? value.toISOString().slice(0, 10) : null;
}

function parseDate(value: string | null | undefined) {
  if (!value) return null;
  return new Date(`${value}T00:00:00.000Z`);
}

function decimalText(value: Prisma.Decimal | null) {
  return value == null ? null : value.toString();
}

function jalaliYear(date = new Date()) {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  if (month < 3 || (month === 3 && day < 21)) return year - 622;
  return year - 621;
}

function utcDateOnly(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addUtcYears(date: Date, years: number) {
  return new Date(Date.UTC(date.getUTCFullYear() + years, date.getUTCMonth(), date.getUTCDate()));
}

function isUniqueConflict(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

function mapIdentity(user: PersonRow) {
  const { birthDate, nationalCardExpiresAt, passportExpiresAt, ...rest } = user;
  return {
    ...rest,
    birthDate: dateOnly(birthDate),
    nationalCardExpiresAt: dateOnly(nationalCardExpiresAt),
    passportExpiresAt: dateOnly(passportExpiresAt),
  };
}

function mapLocation(file: LicenseRow) {
  return {
    cityId: file.premiseCityId,
    establishment: file.premiseEstablishment,
    complexId: file.premiseComplexId,
    address: file.premiseAddress,
    addressEn: file.premiseAddressEn,
    urbanZoneId: file.urbanZoneId,
    plaque: file.premisePlaque,
    plaqueSeries: file.premisePlaqueSeries,
    floor: file.premiseFloor,
    unitNo: file.premiseUnitNo,
    postalCode: file.premisePostalCode,
    phone: file.premisePhone,
    fax: file.premiseFax,
    geoPosition: file.premiseGeoPosition,
    publicAccess: file.premisePublicAccess,
    registrationPlaceId: file.registrationPlaceId,
    ownership: file.premiseOwnership,
    deedNo: file.premiseDeedNo,
    area: decimalText(file.premiseArea),
    leaseIssuedAt: dateOnly(file.leaseIssuedAt),
    leaseExpiresAt: dateOnly(file.leaseExpiresAt),
    leaseAgency: file.leaseAgency,
    ownerName: file.premiseOwnerName,
    ownerNationalId: file.premiseOwnerNationalId,
    files: file.premiseFiles,
  };
}

function mapLicense(file: LicenseRow) {
  const open = file.requests[0] ?? null;
  return {
    id: file.id,
    formationStep: file.formationStep,
    trackingCode: file.trackingCode,
    licenseNumber: file.licenseNumber,
    licenseIssuedAt: dateOnly(file.licenseIssuedAt),
    licenseExpiresAt: dateOnly(file.licenseExpiresAt),
    status: file.status,
    requestType: open?.type ?? (file.licenseNumber ? 'ISSUED' : RentalRequestType.ISSUANCE),
    intakeSubmittedAt: open?.intakeSubmittedAt?.toISOString() ?? null,
    location: mapLocation(file),
  };
}

function canManage(actor: RentalActor) {
  if (actor.isAdmin) return true;
  const codes = actor.permissionCodes ?? [];
  return codes.includes('requests.rental-management') || codes.includes('requests');
}

@Injectable()
export class RentalLicensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly files: PersonFileStorage,
    private readonly settings: RentalSettingsService,
  ) {}

  async contractYears() {
    const settings = await this.settings.getLicenseSettings();
    return { contractYears: settings.contractYears };
  }

  async findIdentity(nationalIdRaw: string, licenseId: string | undefined, actor: RentalActor) {
    const nationalId = normalizeNationalId(nationalIdRaw || '');
    if (!/^\d{10}$/.test(nationalId)) {
      throw new BadRequestException('کد ملی معتبر نیست');
    }
    if (!canManage(actor)) {
      const self = await this.prisma.user.findUnique({
        where: { id: actor.id },
        select: { nationalId: true },
      });
      if (nationalId !== normalizeNationalId(self?.nationalId || '')) {
        throw new ForbiddenException('فقط درخواست خودتان را می‌توانید ببینید');
      }
    }
    const user = await this.prisma.user.findUnique({
      where: { nationalId },
      select: personSelect,
    });
    if (!user) {
      return { found: false as const, person: null, openLicense: null, requestedLicense: null };
    }
    const files = await this.prisma.rentalLicense.findMany({
      where: { userId: user.id },
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      select: licenseSelect,
    });
    const open = files.find((file) => !file.licenseNumber || file.requests.some((item) => item.status === 'OPEN')) ?? files[0] ?? null;
    const requested = licenseId ? (files.find((file) => file.id === licenseId) ?? null) : null;
    return {
      found: true as const,
      person: mapIdentity(user),
      openLicense: open ? mapLicense(open) : null,
      requestedLicense: requested ? mapLicense(requested) : null,
    };
  }

  async saveIdentity(dto: SaveCaseIdentityDto, actor: RentalActor) {
    const nationalId = normalizeNationalId(dto.nationalId);
    if (dto.countryId) {
      const country = await this.prisma.country.findUnique({ where: { id: dto.countryId }, select: { id: true } });
      if (!country) throw new BadRequestException('ملیت معتبر نیست');
    }
    if (dto.jobId) {
      const job = await this.prisma.job.findUnique({ where: { id: dto.jobId }, select: { id: true } });
      if (!job) throw new BadRequestException('شغل معتبر نیست');
    }
    const phone = dto.phone ? normalizeMobile(dto.phone) : null;
    if (phone && !/^09\d{9}$/.test(phone)) {
      throw new BadRequestException('تلفن همراه معتبر نیست');
    }
    await this.assertUniqueContact(nationalId, phone, dto.email ?? null);
    const data = {
      firstName: dto.firstName.trim(),
      lastName: dto.lastName.trim(),
      fullName: joinFullName(dto.firstName, dto.lastName),
      fatherName: dto.fatherName ?? null,
      lastNameEn: dto.lastNameEn?.trim() || null,
      gender: dto.gender ?? null,
      religion: dto.religion ?? null,
      religionOther: dto.religion === 'OTHER' ? dto.religionOther?.trim() || null : null,
      birthDate: parseDate(dto.birthDate),
      residencyStatus: dto.residencyStatus ?? null,
      passportNumber: dto.passportNumber?.trim() || null,
      nationalCardExpiresAt: parseDate(dto.nationalCardExpiresAt),
      passportExpiresAt: parseDate(dto.passportExpiresAt),
      identityCertificateNo: dto.identityCertificateNo?.trim() || null,
      birthPlace: dto.birthPlace?.trim() || null,
      identityIssuedIn: dto.identityIssuedIn?.trim() || null,
      countryId: dto.countryId ?? null,
      phone,
      homePhone: dto.homePhone?.replace(/\D/g, '') || null,
      postalCode: dto.postalCode?.replace(/\D/g, '') || null,
      address: dto.address?.trim() || null,
      email: dto.email?.trim().toLowerCase() || null,
      educationLevel: dto.educationLevel ?? null,
      citizenGroup: dto.citizenGroup?.trim() || null,
      jobId: dto.jobId ?? null,
    };
    const existing = await this.prisma.user.findUnique({
      where: { nationalId },
      select: { id: true },
    });
    if (!canManage(actor) && existing?.id !== actor.id) {
      throw new ForbiddenException('ثبت درخواست برای این شخص مجاز نیست');
    }
    const user = existing
      ? await this.prisma.user.update({ where: { id: existing.id }, data, select: personSelect })
      : await this.createEconomicActor(nationalId, data);
    const license = await this.resolveLicense(user.id, dto.caseId, actor);
    const formationStep =
      license.formationStep < RENTAL_LOCATION_STEP
        ? (
            await this.prisma.rentalLicense.update({
              where: { id: license.id },
              data: { formationStep: RENTAL_LOCATION_STEP },
              select: { formationStep: true },
            })
          ).formationStep
        : license.formationStep;
    return {
      ...mapIdentity(user),
      caseId: license.id,
      formationStep,
      caseTrackingCode: license.trackingCode,
    };
  }

  async saveLocation(dto: SaveRentalLocationDto, actor: RentalActor) {
    const file = await this.requireLicense(dto.licenseId, actor);
    this.assertFirstStageWritable(file, actor);
    const city = await this.prisma.city.findUnique({ where: { id: dto.cityId }, select: { id: true } });
    if (!city) throw new BadRequestException('شهر معتبر نیست');
    const complex = dto.establishment === 'COMMERCIAL_COMPLEX' ? (dto.complexId ?? null) : null;
    if (dto.establishment === 'COMMERCIAL_COMPLEX' && !complex) {
      throw new BadRequestException('مجتمع را انتخاب کنید');
    }
    if (complex) {
      const row = await this.prisma.commercialComplex.findUnique({ where: { id: complex }, select: { id: true } });
      if (!row) throw new BadRequestException('مجتمع معتبر نیست');
    }
    if (dto.urbanZoneId) {
      const zone = await this.prisma.urbanZone.findUnique({ where: { id: dto.urbanZoneId }, select: { id: true } });
      if (!zone) throw new BadRequestException('محدوده شهری معتبر نیست');
    }
    if (dto.registrationPlaceId) {
      const place = await this.prisma.registrationPlace.findUnique({
        where: { id: dto.registrationPlaceId },
        select: { id: true },
      });
      if (!place) throw new BadRequestException('محل ثبت پرونده معتبر نیست');
    }
    const digits = (value?: string | null) => value?.replace(/\D/g, '') || null;
    const saved = await this.prisma.rentalLicense.update({
      where: { id: file.id },
      data: {
        premiseCityId: dto.cityId,
        premiseEstablishment: dto.establishment as PremiseEstablishment,
        premiseComplexId: complex,
        premiseAddress: dto.address?.trim() || null,
        premiseAddressEn: dto.addressEn?.trim() || null,
        urbanZoneId: dto.urbanZoneId ?? null,
        premisePlaque: dto.plaque?.trim() || null,
        premisePlaqueSeries: dto.plaqueSeries?.trim() || null,
        premiseFloor: dto.floor?.trim() || null,
        premiseUnitNo: dto.unitNo?.trim() || null,
        premisePostalCode: digits(dto.postalCode),
        premisePhone: digits(dto.phone),
        premiseFax: digits(dto.fax),
        premiseGeoPosition: (dto.geoPosition ?? null) as PremiseGeoPosition | null,
        premisePublicAccess: (dto.publicAccess ?? null) as PremisePublicAccess | null,
        registrationPlaceId: dto.registrationPlaceId ?? null,
        premiseOwnership: PremiseOwnership.RENTED,
        premiseDeedNo: dto.deedNo?.trim() || null,
        premiseArea: dto.area ?? null,
        leaseIssuedAt: parseDate(dto.leaseIssuedAt),
        leaseExpiresAt: parseDate(dto.leaseExpiresAt),
        leaseAgency: dto.leaseAgency?.trim() || null,
        premiseOwnerName: dto.ownerName?.trim() || null,
        premiseOwnerNationalId: dto.ownerNationalId?.trim() || null,
        formationStep:
          file.formationStep < RENTAL_LOCATION_STEP ? RENTAL_LOCATION_STEP : file.formationStep,
      },
      select: licenseSelect,
    });
    return { formationStep: saved.formationStep, location: mapLocation(saved) };
  }

  async identityDocumentTypes() {
    const own = await this.prisma.rentalIdentityDocument.findMany({
      where: { document: { NOT: { code: PERSONNEL_PHOTO_CODE } } },
      orderBy: { document: { title: 'asc' } },
      select: {
        gender: true,
        isRequired: true,
        document: { select: { id: true, code: true, title: true, description: true, link: true } },
      },
    });
    const rows = own.length
      ? own
      : await this.prisma.caseIdentityDocument.findMany({
          where: { document: { NOT: { code: PERSONNEL_PHOTO_CODE } } },
          orderBy: { document: { title: 'asc' } },
          select: {
            gender: true,
            isRequired: true,
            document: { select: { id: true, code: true, title: true, description: true, link: true } },
          },
        });
    return rows.map((row) => ({ ...row.document, gender: row.gender, isRequired: row.isRequired }));
  }

  async personDocuments(userId: string) {
    await this.assertPerson(userId);
    const rows = await this.prisma.personDocument.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        documentId: true,
        versions: {
          orderBy: { version: 'desc' },
          take: 1,
          select: {
            id: true,
            version: true,
            source: true,
            originalName: true,
            mimeType: true,
            byteSize: true,
            createdAt: true,
          },
        },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      documentId: row.documentId,
      current: row.versions[0] ?? null,
    }));
  }

  async processDocumentTypes() {
    const rows = await this.prisma.rentalDocumentRequirement.findMany({
      where: { document: { NOT: { code: PERSONNEL_PHOTO_CODE } } },
      orderBy: { document: { title: 'asc' } },
      select: {
        gender: true,
        isRequired: true,
        document: { select: { id: true, code: true, title: true, description: true, link: true } },
      },
    });
    return rows.map((row) => ({ ...row.document, gender: row.gender, isRequired: row.isRequired }));
  }

  async processDocuments(licenseId: string) {
    const request = await this.openRequest(licenseId);
    if (!request) return [];
    const rows = await this.prisma.rentalRequestDocument.findMany({
      where: { requestId: request.id },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        documentId: true,
        versions: {
          orderBy: { version: 'desc' },
          take: 1,
          select: {
            id: true,
            version: true,
            source: true,
            originalName: true,
            mimeType: true,
            byteSize: true,
            createdAt: true,
          },
        },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      documentId: row.documentId,
      current: row.versions[0] ?? null,
    }));
  }

  async uploadDocument(input: {
    userId: string;
    documentId: string;
    licenseId?: string;
    scope?: string;
    actor: RentalActor;
    buffer: Buffer;
    mimeType: string;
    originalName: string;
  }) {
    await this.assertPerson(input.userId);
    const document = await this.prisma.document.findUnique({
      where: { id: input.documentId },
      select: { id: true, code: true },
    });
    if (!document || document.code === PERSONNEL_PHOTO_CODE) {
      throw new BadRequestException('مدرک معتبر نیست');
    }
    if (input.licenseId) {
      const file = await this.requireLicense(input.licenseId, input.actor);
      this.assertFirstStageWritable(file, input.actor);
      return this.uploadProcessDocument(file, document.id, input);
    }
    const allowed = await this.identityDocumentTypes();
    if (input.scope !== 'other' && !allowed.some((item) => item.id === document.id)) {
      throw new NotFoundException('این مدرک در فهرست مدارک اطلاعات هویتی نیست');
    }
    const maxVersion = await this.prisma.personDocumentVersion.aggregate({
      where: { personDocument: { userId: input.userId, documentId: document.id } },
      _max: { version: true },
    });
    const version = (maxVersion._max.version ?? 0) + 1;
    const personDocument = await this.prisma.personDocument.create({
      data: { userId: input.userId, documentId: document.id },
      select: { id: true },
    });
    const stored = await this.files.save({
      personId: input.userId,
      documentId: document.id,
      version,
      buffer: input.buffer,
      mimeType: input.mimeType,
      originalName: input.originalName,
    });
    const created = await this.prisma.personDocumentVersion.create({
      data: {
        personDocumentId: personDocument.id,
        version,
        source: DocumentSource.MANUAL,
        storageKey: stored.storageKey,
        originalName: stored.originalName,
        mimeType: stored.mimeType,
        byteSize: stored.byteSize,
      },
      select: {
        id: true,
        version: true,
        source: true,
        originalName: true,
        mimeType: true,
        byteSize: true,
        createdAt: true,
      },
    });
    return { id: personDocument.id, documentId: document.id, current: created };
  }

  async removeDocument(documentId: string, userId: string, licenseId?: string, actor?: RentalActor) {
    if (licenseId) {
      const file = await this.requireLicense(licenseId, actor ?? { id: userId });
      this.assertFirstStageWritable(file, actor ?? { id: userId });
      const request = await this.openRequest(licenseId);
      if (!request) throw new NotFoundException('درخواست باز یافت نشد');
      const row = await this.prisma.rentalRequestDocument.findFirst({
        where: { id: documentId, requestId: request.id },
        select: { id: true, versions: { select: { storageKey: true } } },
      });
      if (!row) throw new NotFoundException('مدرک یافت نشد');
      await this.prisma.rentalRequestDocument.delete({ where: { id: row.id } });
      for (const version of row.versions) await this.files.remove(version.storageKey);
      return { ok: true };
    }
    const row = await this.prisma.personDocument.findFirst({
      where: { id: documentId, userId },
      select: { id: true, versions: { select: { storageKey: true } } },
    });
    if (!row) throw new NotFoundException('مدرک یافت نشد');
    await this.prisma.personDocument.delete({ where: { id: row.id } });
    for (const version of row.versions) await this.files.remove(version.storageKey);
    return { ok: true };
  }

  async readPersonDocumentFile(userId: string, versionId: string) {
    const version = await this.prisma.personDocumentVersion.findUnique({
      where: { id: versionId },
      include: { personDocument: { select: { userId: true } } },
    });
    if (!version || version.personDocument.userId !== userId) {
      throw new NotFoundException('فایل مدرک یافت نشد');
    }
    return {
      mimeType: version.mimeType,
      byteSize: version.byteSize,
      originalName: version.originalName,
      data: await this.files.read(version.storageKey),
    };
  }

  async readPersonDocumentFileByVersion(versionId: string) {
    const version = await this.prisma.personDocumentVersion.findUnique({ where: { id: versionId } });
    if (!version) throw new NotFoundException('فایل مدرک یافت نشد');
    return {
      mimeType: version.mimeType,
      byteSize: version.byteSize,
      originalName: version.originalName,
      data: await this.files.read(version.storageKey),
    };
  }

  async readProcessDocumentFile(versionId: string) {
    const version = await this.prisma.rentalRequestDocumentVersion.findUnique({ where: { id: versionId } });
    if (!version) throw new NotFoundException('فایل مدرک یافت نشد');
    return {
      mimeType: version.mimeType,
      byteSize: version.byteSize,
      originalName: version.originalName,
      data: await this.files.read(version.storageKey),
    };
  }

  async uploadPremiseFile(input: {
    licenseId: string;
    kind: string;
    actor: RentalActor;
    buffer?: Buffer;
    mimeType?: string;
    originalName?: string;
  }) {
    if (!input.buffer?.length) throw new BadRequestException('فایل را انتخاب کنید');
    const kind = input.kind as CasePremiseFileKind;
    if (kind !== CasePremiseFileKind.DEED && kind !== CasePremiseFileKind.AUTHORIZATION_LETTER) {
      throw new BadRequestException('نوع پیوست معتبر نیست');
    }
    const file = await this.requireLicense(input.licenseId, input.actor);
    this.assertFirstStageWritable(file, input.actor);
    const stored = await this.files.saveRental({
      personId: file.userId,
      licenseId: file.id,
      folder: 'premise',
      fileId: randomUUID(),
      buffer: input.buffer,
      mimeType: input.mimeType || 'application/octet-stream',
      originalName: input.originalName || 'file',
    });
    return this.prisma.rentalPremiseFile.create({
      data: {
        licenseId: file.id,
        kind,
        storageKey: stored.storageKey,
        originalName: stored.originalName,
        mimeType: stored.mimeType,
        byteSize: stored.byteSize,
      },
      select: { id: true, kind: true, originalName: true, mimeType: true, byteSize: true },
    });
  }

  async removePremiseFile(id: string, actor: RentalActor) {
    const row = await this.prisma.rentalPremiseFile.findUnique({
      where: { id },
      select: { id: true, storageKey: true, licenseId: true },
    });
    if (!row) throw new NotFoundException('پیوست یافت نشد');
    const file = await this.requireLicense(row.licenseId, actor);
    this.assertFirstStageWritable(file, actor);
    await this.prisma.rentalPremiseFile.delete({ where: { id } });
    await this.files.remove(row.storageKey);
    return { ok: true };
  }

  async readPremiseFile(id: string) {
    const row = await this.prisma.rentalPremiseFile.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('پیوست یافت نشد');
    return {
      mimeType: row.mimeType,
      byteSize: row.byteSize,
      originalName: row.originalName,
      data: await this.files.read(row.storageKey),
    };
  }

  async submitIntake(licenseId: string, actor: RentalActor) {
    const file = await this.requireLicense(licenseId, actor);
    this.assertFirstStageWritable(file, actor);
    if (!file.premiseCityId || !file.premiseAddress) {
      throw new BadRequestException('محل و قرارداد را کامل کنید');
    }
    await this.assertRequiredDocuments(file);
    const request = await this.ensureOpenRequest(file.id, file.licenseNumber ? RentalRequestType.RENEWAL : RentalRequestType.ISSUANCE);
    await this.prisma.$transaction([
      this.prisma.rentalLicense.update({
        where: { id: file.id },
        data: { formationStep: RENTAL_MANAGEMENT_STEP },
      }),
      this.prisma.rentalRequest.update({
        where: { id: request.id },
        data: {
          formationStep: RENTAL_MANAGEMENT_STEP,
          intakeSubmittedAt: request.intakeSubmittedAt ?? new Date(),
        },
      }),
    ]);
    await this.ensureReviews(request.id, file.id);
    return { formationStep: RENTAL_MANAGEMENT_STEP };
  }

  async advanceStep(dto: SaveRentalStepDto, actor: RentalActor) {
    if (!canManage(actor) && dto.step > RENTAL_LOCATION_STEP) {
      throw new ForbiddenException('دسترسی به این مرحله مجاز نیست');
    }
    const file = await this.requireLicense(dto.licenseId, actor);
    if (dto.step === RENTAL_LOCATION_STEP) {
      return { formationStep: Math.max(file.formationStep, RENTAL_LOCATION_STEP) };
    }
    if (dto.step === RENTAL_MANAGEMENT_STEP) return this.submitIntake(dto.licenseId, actor);
    if (dto.step === RENTAL_ISSUANCE_STEP) {
      if (!canManage(actor)) throw new ForbiddenException('دسترسی به صدور مجوز ندارید');
      await this.assertManagementApproved(file.id);
      const request = await this.openRequest(file.id);
      await this.prisma.$transaction([
        this.prisma.rentalLicense.update({
          where: { id: file.id },
          data: { formationStep: RENTAL_ISSUANCE_STEP },
        }),
        ...(request
          ? [
              this.prisma.rentalRequest.update({
                where: { id: request.id },
                data: { formationStep: RENTAL_ISSUANCE_STEP },
              }),
            ]
          : []),
      ]);
      return { formationStep: RENTAL_ISSUANCE_STEP };
    }
    throw new BadRequestException('مرحله معتبر نیست');
  }

  async complete(dto: SaveRentalStepDto, actor: RentalActor) {
    if (!canManage(actor)) throw new ForbiddenException('صدور مجوز فقط برای مدیریت است');
    const file = await this.requireLicense(dto.licenseId, actor);
    await this.assertManagementApproved(file.id);
    await this.assertRequiredDocuments(file);
    const settings = await this.settings.getLicenseSettings();
    const issuedAt = dto.licenseIssuedAt ? utcDateOnly(parseDate(dto.licenseIssuedAt)!) : utcDateOnly(new Date());
    const expiresAt = dto.licenseExpiresAt
      ? utcDateOnly(parseDate(dto.licenseExpiresAt)!)
      : addUtcYears(issuedAt, clampContractYears(settings.contractYears));
    if (expiresAt.getTime() <= issuedAt.getTime()) {
      throw new BadRequestException('تاریخ انقضا باید بعد از تاریخ صدور باشد');
    }
    const request = await this.openRequest(file.id);
    const licenseNumber = file.licenseNumber ?? (await this.assignLicenseNumber(file.id, issuedAt, expiresAt));
    await this.prisma.rentalLicense.update({
      where: { id: file.id },
      data: {
        status: RentalLicenseStatus.ACTIVE,
        formationStep: RENTAL_ISSUANCE_STEP,
        licenseNumber,
        licenseIssuedAt: issuedAt,
        firstIssuedAt: file.firstIssuedAt ?? issuedAt,
        licenseExpiresAt: expiresAt,
      },
    });
    if (request) {
      await this.prisma.rentalRequest.update({
        where: { id: request.id },
        data: {
          status: RentalRequestStatus.ISSUED,
          formationStep: RENTAL_ISSUANCE_STEP,
          completedAt: new Date(),
        },
      });
    }
    return { ok: true, licenseNumber };
  }

  async startRenewal(licenseId: string, actor: RentalActor) {
    if (!canManage(actor)) throw new ForbiddenException('تمدید فقط برای مدیریت است');
    const file = await this.requireLicense(licenseId, actor);
    if (!file.licenseNumber) throw new BadRequestException('هنوز مجوزی صادر نشده است');
    const open = await this.openRequest(file.id);
    if (open) return { licenseId: file.id, requestId: open.id, formationStep: file.formationStep };
    const request = await this.ensureOpenRequest(file.id, RentalRequestType.RENEWAL);
    await this.prisma.rentalLicense.update({
      where: { id: file.id },
      data: { formationStep: RENTAL_IDENTITY_STEP, status: RentalLicenseStatus.ACTIVE },
    });
    return { licenseId: file.id, requestId: request.id, formationStep: RENTAL_IDENTITY_STEP };
  }

  async list(query: FindRentalLicensesQueryDto) {
    const where: Prisma.RentalLicenseWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.q
        ? {
            OR: [
              { trackingCode: containsInsensitive(query.q) },
              { licenseNumber: containsInsensitive(query.q) },
              { user: { fullName: containsInsensitive(query.q) } },
              { user: { nationalId: containsInsensitive(query.q) } },
              { premiseAddress: containsInsensitive(query.q) },
            ],
          }
        : {}),
    };
    const orderBy = resolveSortOrder<Prisma.RentalLicenseOrderByWithRelationInput>(
      query.sortBy,
      query.sortDir,
      {
        fullName: (dir) => ({ user: { fullName: dir } }),
        nationalId: (dir) => ({ user: { nationalId: dir } }),
        licenseNumber: (dir) => ({ licenseNumber: dir }),
        status: (dir) => ({ status: dir }),
        createdAt: (dir) => ({ createdAt: dir }),
        licenseExpiresAt: (dir) => ({ licenseExpiresAt: dir }),
      },
      [{ createdAt: 'desc' }, { id: 'asc' }],
    );
    const { page, pageSize, skip, take } = paginationArgs(query);
    const [rows, total] = await Promise.all([
      this.prisma.rentalLicense.findMany({
        where,
        orderBy,
        skip,
        take,
        select: {
          id: true,
          status: true,
          formationStep: true,
          trackingCode: true,
          licenseNumber: true,
          licenseIssuedAt: true,
          licenseExpiresAt: true,
          createdAt: true,
          user: {
            select: { id: true, fullName: true, nationalId: true, photoId: true },
          },
          requests: {
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            take: 1,
            select: { id: true, type: true, status: true, number: true },
          },
        },
      }),
      this.prisma.rentalLicense.count({ where }),
    ]);
    return paginatedResult(
      rows.map((row) => ({
        id: row.id,
        status: row.status,
        formationStep: row.formationStep,
        trackingCode: row.trackingCode,
        licenseNumber: row.licenseNumber,
        licenseIssuedAt: dateOnly(row.licenseIssuedAt),
        licenseExpiresAt: dateOnly(row.licenseExpiresAt),
        createdAt: row.createdAt.toISOString(),
        fullName: row.user.fullName,
        nationalId: row.user.nationalId,
        photoId: row.user.photoId,
        requestType: row.requests[0]?.type ?? null,
        requestStatus: row.requests[0]?.status ?? null,
        requestNumber: row.requests[0]?.number ?? null,
      })),
      total,
      page,
      pageSize,
    );
  }

  async remove(id: string, actor: RentalActor) {
    if (!canManage(actor)) throw new ForbiddenException('حذف فقط برای مدیریت است');
    const file = await this.prisma.rentalLicense.findUnique({
      where: { id },
      select: { id: true, licenseNumber: true },
    });
    if (!file) throw new NotFoundException('مجوز یافت نشد');
    if (file.licenseNumber) throw new BadRequestException('مجوز صادرشده حذف نمی‌شود');
    await this.prisma.rentalLicense.delete({ where: { id } });
    return { ok: true };
  }

  async licenseDocument(id: string, actor: RentalActor) {
    await this.requireLicense(id, actor);
    const file = await this.prisma.rentalLicense.findUnique({
      where: { id },
      select: {
        licenseNumber: true,
        status: true,
        formationStep: true,
        trackingCode: true,
        licenseIssuedAt: true,
        licenseExpiresAt: true,
        premiseAddress: true,
        premiseAddressEn: true,
        premisePlaque: true,
        premiseFloor: true,
        premiseUnitNo: true,
        premisePostalCode: true,
        premisePhone: true,
        premiseCity: { select: { nameFa: true, nameEn: true } },
        premiseComplex: { select: { name: true, nameEn: true } },
        user: {
          select: {
            firstName: true,
            lastName: true,
            lastNameEn: true,
            gender: true,
            birthDate: true,
            passportNumber: true,
            photoId: true,
            country: { select: { iso2: true, nameFa: true, nameEn: true } },
          },
        },
        requests: {
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: 1,
          select: { number: true },
        },
      },
    });
    if (!file) throw new NotFoundException('مجوز یافت نشد');
    if (!file.licenseNumber) {
      return {
        licenseNumber: null,
        firstName: file.user.firstName,
        lastName: file.user.lastName,
        gender: file.user.gender,
      };
    }
    const stamp = await this.settings.getLicenseSettings();
    return {
      licenseNumber: file.licenseNumber,
      status: file.status,
      issuedAt: dateOnly(file.licenseIssuedAt),
      expiresAt: dateOnly(file.licenseExpiresAt),
      requestNumber: file.requests[0]?.number ?? null,
      trackingCode: file.trackingCode,
      firstName: file.user.firstName,
      lastName: file.user.lastName,
      lastNameEn: file.user.lastNameEn,
      gender: file.user.gender,
      birthDate: dateOnly(file.user.birthDate),
      nationalityIso2: file.user.country?.iso2 ?? null,
      nationalityFa: file.user.country?.nameFa ?? null,
      nationalityEn: file.user.country?.nameEn ?? null,
      passportNumber: file.user.passportNumber,
      phone: file.premisePhone,
      tradeName: null,
      activityTitle: 'اجاره‌داری',
      activityTitleEn: 'Rental license',
      photoId: file.user.photoId,
      signerName: stamp.signerName,
      signerTitle: stamp.signerTitle,
      signatureId: stamp.signatureId,
      address: file.premiseAddress,
      addressEn: file.premiseAddressEn,
      plaque: file.premisePlaque,
      floor: file.premiseFloor,
      unitNo: file.premiseUnitNo,
      postalCode: file.premisePostalCode,
      cityNameFa: file.premiseCity?.nameFa ?? null,
      cityNameEn: file.premiseCity?.nameEn ?? null,
      complexName: file.premiseComplex?.name ?? null,
      complexNameEn: file.premiseComplex?.nameEn ?? null,
    };
  }

  async listReviews(licenseId: string) {
    const request = await this.openRequest(licenseId);
    if (!request) return [];
    await this.ensureReviews(request.id, licenseId);
    const titles = await this.prisma.rentalProcessManagementRole.findMany({
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { roleId: true, title: true },
    });
    if (!titles.length) return [];
    const titleByRole = new Map(titles.map((item) => [item.roleId, item.title]));
    const order = new Map(titles.map((item, index) => [item.roleId, index]));
    const rows = (
      await this.prisma.rentalManagementReview.findMany({
        where: { requestId: request.id, roleId: { in: [...titleByRole.keys()] } },
        include: {
          role: { select: { id: true, name: true } },
          decidedBy: { select: { id: true, fullName: true } },
          files: {
            orderBy: { createdAt: 'asc' },
            select: { id: true, originalName: true, mimeType: true, byteSize: true, createdAt: true },
          },
        },
      })
    ).sort((left, right) => (order.get(left.roleId) ?? 0) - (order.get(right.roleId) ?? 0) || left.id.localeCompare(right.id));
    const people = await this.prisma.user.findMany({
      where: {
        status: UserStatus.ACTIVE,
        userRoles: { some: { roleId: { in: rows.map((row) => row.roleId) } } },
      },
      select: { id: true, fullName: true, userRoles: { select: { roleId: true } } },
      orderBy: [{ fullName: 'asc' }, { id: 'asc' }],
    });
    return rows.map((row) => ({
      id: row.id,
      status: row.status,
      channel: row.channel,
      note: row.note,
      createdAt: row.createdAt.toISOString(),
      decidedAt: row.decidedAt?.toISOString() ?? null,
      decidedBy: row.decidedBy,
      workUnitTitle: null,
      roleId: row.roleId,
      roleName: row.role.name,
      displayTitle: titleByRole.get(row.roleId) ?? null,
      people: people
        .filter((person) => person.userRoles.some((item) => item.roleId === row.roleId))
        .map((person) => ({ id: person.id, fullName: person.fullName })),
      files: row.files.map((file) => ({
        id: file.id,
        originalName: file.originalName,
        mimeType: file.mimeType,
        byteSize: file.byteSize,
        createdAt: file.createdAt.toISOString(),
      })),
    }));
  }

  async decideReview(
    id: string,
    actor: RentalActor,
    input: {
      status: string;
      note?: string | null;
      file?: { buffer: Buffer; mimeType: string; originalName: string };
    },
  ) {
    const row = await this.prisma.rentalManagementReview.findUnique({
      where: { id },
      include: { request: { select: { status: true } }, license: { select: { userId: true } } },
    });
    if (!row) throw new NotFoundException('تایید مدیریتی یافت نشد');
    if (row.request.status !== RentalRequestStatus.OPEN) {
      throw new BadRequestException('این درخواست قابل تغییر نیست');
    }
    if (row.status !== CaseInquiryStatus.PENDING) {
      throw new BadRequestException('نتیجه این تایید قبلاً ثبت شده است');
    }
    const actorRoles = await this.prisma.userRole.findMany({
      where: { userId: actor.id },
      select: { roleId: true },
    });
    const ownRole = actorRoles.some((item) => item.roleId === row.roleId);
    if (!canManage(actor) && !ownRole && !actor.isAdmin) {
      throw new ForbiddenException('ثبت نتیجه این تایید برای شما مجاز نیست');
    }
    if (input.status !== CaseInquiryStatus.APPROVED && input.status !== CaseInquiryStatus.REJECTED) {
      throw new BadRequestException('نتیجه تایید معتبر نیست');
    }
    const note = input.note?.trim() || null;
    if (input.status === CaseInquiryStatus.REJECTED && !note) {
      throw new BadRequestException('برای رد توضیحات لازم است');
    }
    if (input.file?.buffer?.length) {
      const stored = await this.files.saveRental({
        personId: row.license.userId,
        licenseId: row.licenseId,
        folder: 'reviews',
        fileId: randomUUID(),
        buffer: input.file.buffer,
        mimeType: input.file.mimeType,
        originalName: input.file.originalName,
      });
      await this.prisma.rentalManagementReviewFile.create({
        data: {
          reviewId: row.id,
          storageKey: stored.storageKey,
          originalName: stored.originalName,
          mimeType: stored.mimeType,
          byteSize: stored.byteSize,
          uploadedById: actor.id,
        },
      });
    }
    await this.prisma.rentalManagementReview.update({
      where: { id },
      data: {
        status: input.status as CaseInquiryStatus,
        channel: CaseInquiryChannel.MANUAL,
        note,
        decidedById: actor.id,
        decidedAt: new Date(),
      },
    });
    if (input.status === CaseInquiryStatus.APPROVED && canManage(actor)) {
      try {
        await this.assertManagementApproved(row.licenseId);
        await this.prisma.rentalLicense.update({
          where: { id: row.licenseId },
          data: { formationStep: RENTAL_ISSUANCE_STEP },
        });
        await this.prisma.rentalRequest.update({
          where: { id: row.requestId },
          data: { formationStep: RENTAL_ISSUANCE_STEP },
        });
      } catch {
        /* still pending other roles */
      }
    }
    return { ok: true };
  }

  async reopenReview(id: string, actor: RentalActor) {
    if (!canManage(actor)) throw new ForbiddenException('بازگشایی فقط برای مدیریت است');
    const row = await this.prisma.rentalManagementReview.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('تایید مدیریتی یافت نشد');
    await this.prisma.rentalManagementReview.update({
      where: { id },
      data: {
        status: CaseInquiryStatus.PENDING,
        channel: null,
        note: null,
        decidedById: null,
        decidedAt: null,
      },
    });
    await this.prisma.rentalLicense.update({
      where: { id: row.licenseId },
      data: { formationStep: RENTAL_MANAGEMENT_STEP },
    });
    await this.prisma.rentalRequest.update({
      where: { id: row.requestId },
      data: { formationStep: RENTAL_MANAGEMENT_STEP },
    });
    return { ok: true };
  }

  async readReviewFile(fileId: string) {
    const row = await this.prisma.rentalManagementReviewFile.findUnique({ where: { id: fileId } });
    if (!row) throw new NotFoundException('فایل یافت نشد');
    return {
      mimeType: row.mimeType,
      byteSize: row.byteSize,
      originalName: row.originalName,
      data: await this.files.read(row.storageKey),
    };
  }

  private async uploadProcessDocument(
    file: { id: string; userId: string },
    documentId: string,
    input: { buffer: Buffer; mimeType: string; originalName: string; scope?: string },
  ) {
    const allowed = await this.processDocumentTypes();
    if (input.scope !== 'other' && !allowed.some((item) => item.id === documentId)) {
      throw new NotFoundException('این مدرک در فهرست مدارک درخواست نیست');
    }
    const request = await this.ensureOpenRequest(file.id, RentalRequestType.ISSUANCE);
    const maxVersion = await this.prisma.rentalRequestDocumentVersion.aggregate({
      where: { documentRow: { requestId: request.id, documentId } },
      _max: { version: true },
    });
    const version = (maxVersion._max.version ?? 0) + 1;
    const row = await this.prisma.rentalRequestDocument.create({
      data: { requestId: request.id, documentId },
      select: { id: true },
    });
    const stored = await this.files.saveRental({
      personId: file.userId,
      licenseId: file.id,
      folder: 'documents',
      fileId: `${documentId}-v${version}`,
      buffer: input.buffer,
      mimeType: input.mimeType,
      originalName: input.originalName,
    });
    const created = await this.prisma.rentalRequestDocumentVersion.create({
      data: {
        documentRowId: row.id,
        version,
        source: DocumentSource.MANUAL,
        storageKey: stored.storageKey,
        originalName: stored.originalName,
        mimeType: stored.mimeType,
        byteSize: stored.byteSize,
      },
      select: {
        id: true,
        version: true,
        source: true,
        originalName: true,
        mimeType: true,
        byteSize: true,
        createdAt: true,
      },
    });
    return { id: row.id, documentId, current: created };
  }

  private async assertRequiredDocuments(file: { id: string; userId: string }) {
    const identityTypes = await this.identityDocumentTypes();
    const storedIdentity = await this.personDocuments(file.userId);
    const uploadedIdentity = new Set(storedIdentity.filter((row) => row.current).map((row) => row.documentId));
    const person = await this.prisma.user.findUnique({ where: { id: file.userId }, select: { gender: true } });
    const missingIdentity = identityTypes.some(
      (item) =>
        item.isRequired &&
        (item.gender === 'BOTH' || !person?.gender || item.gender === person.gender) &&
        !uploadedIdentity.has(item.id),
    );
    if (missingIdentity) throw new BadRequestException('مدارک هویتی لازم کامل نیست');
    const processTypes = await this.processDocumentTypes();
    const storedProcess = await this.processDocuments(file.id);
    const uploadedProcess = new Set(storedProcess.filter((row) => row.current).map((row) => row.documentId));
    const missingProcess = processTypes.some(
      (item) =>
        item.isRequired &&
        (item.gender === 'BOTH' || !person?.gender || item.gender === person.gender) &&
        !uploadedProcess.has(item.id),
    );
    if (missingProcess) throw new BadRequestException('مدارک لازم درخواست کامل نیست');
  }

  private async assertManagementApproved(licenseId: string) {
    const request = await this.openRequest(licenseId);
    if (!request) throw new BadRequestException('درخواست باز یافت نشد');
    await this.ensureReviews(request.id, licenseId);
    const roles = await this.prisma.rentalProcessManagementRole.findMany({ select: { roleId: true } });
    if (!roles.length) return;
    const pending = await this.prisma.rentalManagementReview.count({
      where: {
        requestId: request.id,
        roleId: { in: roles.map((item) => item.roleId) },
        status: { not: CaseInquiryStatus.APPROVED },
      },
    });
    if (pending > 0) {
      throw new BadRequestException('قبل از صدور مجوز باید نتیجه همه تاییدهای مدیریتی ثبت شود');
    }
  }

  private async ensureReviews(requestId: string, licenseId: string) {
    const roles = await this.prisma.rentalProcessManagementRole.findMany({ select: { roleId: true } });
    if (!roles.length) return;
    await this.prisma.rentalManagementReview.createMany({
      data: roles.map((item) => ({ requestId, licenseId, roleId: item.roleId })),
      skipDuplicates: true,
    });
  }

  private async openRequest(licenseId: string) {
    return this.prisma.rentalRequest.findFirst({
      where: { licenseId, status: RentalRequestStatus.OPEN },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
  }

  private async ensureOpenRequest(licenseId: string, type: RentalRequestType) {
    const open = await this.openRequest(licenseId);
    if (open) return open;
    const number = await this.nextRequestNumber();
    return this.prisma.rentalRequest.create({
      data: { licenseId, type, number },
    });
  }

  private async nextRequestNumber() {
    const prefix = `RREQ-${jalaliYear()}-`;
    for (let attempt = 0; attempt < 8; attempt++) {
      const count = await this.prisma.rentalRequest.count({ where: { number: { startsWith: prefix } } });
      const number = `${prefix}${String(count + 1 + attempt).padStart(6, '0')}`;
      const taken = await this.prisma.rentalRequest.findUnique({ where: { number }, select: { id: true } });
      if (!taken) return number;
    }
    throw new ConflictException('صدور شماره درخواست انجام نشد');
  }

  private async assignLicenseNumber(licenseId: string, issuedAt: Date, expiresAt: Date) {
    const prefix = `R-${jalaliYear(issuedAt)}-`;
    for (let attempt = 0; attempt < 8; attempt++) {
      const count = await this.prisma.rentalLicense.count({
        where: { licenseNumber: { startsWith: prefix } },
      });
      const licenseNumber = `${prefix}${String(count + 1 + attempt).padStart(5, '0')}`;
      try {
        const updated = await this.prisma.rentalLicense.updateMany({
          where: { id: licenseId, licenseNumber: null },
          data: { licenseNumber, licenseIssuedAt: issuedAt, firstIssuedAt: issuedAt, licenseExpiresAt: expiresAt },
        });
        if (updated.count === 1) return licenseNumber;
        const row = await this.prisma.rentalLicense.findUnique({
          where: { id: licenseId },
          select: { licenseNumber: true },
        });
        if (row?.licenseNumber) return row.licenseNumber;
      } catch (error) {
        if (!isUniqueConflict(error)) throw error;
      }
    }
    throw new ConflictException('صدور شماره مجوز اجاره‌داری انجام نشد');
  }

  private async resolveLicense(userId: string, licenseId: string | null | undefined, actor: RentalActor) {
    if (licenseId) {
      const row = await this.prisma.rentalLicense.findFirst({
        where: { id: licenseId, userId },
        select: { id: true, formationStep: true, trackingCode: true, licenseNumber: true },
      });
      if (!row) throw new BadRequestException('مجوز متعلق به این شخص نیست');
      await this.ensureTrackingCode(row.id, row.trackingCode);
      await this.ensureOpenRequest(row.id, row.licenseNumber ? RentalRequestType.RENEWAL : RentalRequestType.ISSUANCE);
      return row;
    }
    const existing = await this.prisma.rentalLicense.findUnique({
      where: { userId },
      select: { id: true, formationStep: true, trackingCode: true, licenseNumber: true },
    });
    if (existing) {
      await this.ensureTrackingCode(existing.id, existing.trackingCode);
      await this.ensureOpenRequest(
        existing.id,
        existing.licenseNumber ? RentalRequestType.RENEWAL : RentalRequestType.ISSUANCE,
      );
      return existing;
    }
    if (!canManage(actor) && !(actor.permissionCodes ?? []).includes('requests.rental') && !actor.isAdmin) {
      throw new ForbiddenException('ثبت درخواست برای شما مجاز نیست');
    }
    const created = await this.prisma.rentalLicense.create({
      data: { userId, formationStep: RENTAL_IDENTITY_STEP },
      select: { id: true, formationStep: true, trackingCode: true, licenseNumber: true },
    });
    await this.ensureTrackingCode(created.id, created.trackingCode);
    await this.ensureOpenRequest(created.id, RentalRequestType.ISSUANCE);
    return created;
  }

  private async ensureTrackingCode(id: string, current: string | null) {
    if (current) return current;
    const prefix = `RNT-${jalaliYear()}-`;
    for (let attempt = 0; attempt < 6; attempt++) {
      const count = await this.prisma.rentalLicense.count({
        where: { trackingCode: { startsWith: prefix } },
      });
      const code = `${prefix}${String(count + 1 + attempt).padStart(6, '0')}`;
      try {
        const updated = await this.prisma.rentalLicense.updateMany({
          where: { id, trackingCode: null },
          data: { trackingCode: code },
        });
        if (updated.count === 1) return code;
      } catch (error) {
        if (!isUniqueConflict(error)) throw error;
      }
    }
    return current;
  }

  private async requireLicense(id: string, actor: RentalActor) {
    const file = await this.prisma.rentalLicense.findUnique({ where: { id }, select: licenseSelect });
    if (!file) throw new NotFoundException('مجوز یافت نشد');
    if (!actor.id) throw new UnauthorizedException();
    if (!canManage(actor) && file.userId !== actor.id) {
      throw new ForbiddenException('دسترسی به این مجوز ندارید');
    }
    return file;
  }

  async getOne(id: string, actor: RentalActor) {
    const file = await this.requireLicense(id, actor);
    const user = await this.prisma.user.findUnique({
      where: { id: file.userId },
      select: personSelect,
    });
    if (!user) throw new NotFoundException('شخص یافت نشد');
    return {
      person: {
        ...mapIdentity(user),
        caseId: file.id,
        formationStep: file.formationStep,
        caseTrackingCode: file.trackingCode,
      },
      license: mapLicense(file),
    };
  }

  private assertFirstStageWritable(file: LicenseRow, actor: RentalActor) {
    const open = file.requests[0];
    if (open?.intakeSubmittedAt && !canManage(actor) && file.formationStep >= RENTAL_MANAGEMENT_STEP) {
      throw new BadRequestException('درخواست ثبت شده و در انتظار بررسی مدیریت است');
    }
  }

  private async createEconomicActor(nationalId: string, data: Prisma.UserUpdateInput) {
    const takenUsername = await this.prisma.user.findUnique({
      where: { username: nationalId },
      select: { id: true },
    });
    if (takenUsername) {
      throw new ConflictException('این کد ملی قبلاً به‌عنوان نام کاربری ثبت شده است');
    }
    const role = await ensureEconomicActorRole(this.prisma);
    const passwordHash = await bcrypt.hash(ECONOMIC_ACTOR_INITIAL_PASSWORD, 10);
    return this.prisma.user.create({
      data: {
        ...(data as Prisma.UserCreateInput),
        username: nationalId,
        passwordHash,
        nationalId,
        locale: 'fa',
        status: UserStatus.ACTIVE,
        userRoles: { create: { roleId: role.id } },
      },
      select: personSelect,
    });
  }

  private async assertPerson(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) throw new NotFoundException('شخص یافت نشد');
  }

  private async assertUniqueContact(nationalId: string, phone: string | null, email: string | null) {
    if (phone) {
      const hit = await this.prisma.user.findFirst({
        where: { phone, NOT: { nationalId } },
        select: { id: true },
      });
      if (hit) throw new ConflictException('این تلفن همراه قبلاً ثبت شده است');
    }
    if (email) {
      const hit = await this.prisma.user.findFirst({
        where: { email, NOT: { nationalId } },
        select: { id: true },
      });
      if (hit) throw new ConflictException('این ایمیل قبلاً ثبت شده است');
    }
  }
}

export function rentalTodayIso() {
  return todayIsoDateTehran();
}
