import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';
import { normalizeNationalId } from '../common/national-id';
import { normalizeMobile } from '../common/phone';
import {
  containsInsensitive,
  normalizeSearchDigits,
  paginatedResult,
  paginationArgs,
  wantsPagination,
} from '../common/pagination';
import { resolveSortOrder } from '../common/sort-query';
import {
  CaseInquiryStatus,
  DocumentGender,
  DocumentSource,
  PremiseEstablishment,
  PremiseGeoPosition,
  PremiseOwnership,
  PremisePublicAccess,
  PreviousOccupation,
  Prisma,
  UserStatus,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { joinFullName } from '../users/user-profile.util';
import { FindCasesQueryDto } from './dto/find-cases-query.dto';
import { SaveCaseActivityDto } from './dto/save-case-activity.dto';
import { SaveCaseLocationDto } from './dto/save-case-location.dto';
import { SaveCaseIdentityDto } from './dto/save-case-identity.dto';
import { SaveFormationStepDto } from './dto/save-formation-step.dto';
import { PersonFileStorage } from './person-file.storage';
import { CaseInquiriesService } from './case-inquiries.service';

/** 0 هویت، 1 فعالیت، 2 محل، 3 استعلام، 4 اماکن، 5 بررسی مدیریت، 6 صدور */
const PLACES_FORMATION_STEP = 4;

const identitySelect = {
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
  formationStep: true,
  caseTrackingCode: true,
  businessUnitTitle: true,
  previousOccupation: true,
  posDeviceCount: true,
  activityJob: { select: { id: true, groupId: true, jobType: { select: { title: true } } } },
  premiseCityId: true,
  premiseEstablishment: true,
  premiseComplexId: true,
  premiseAddress: true,
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
  jobId: true,
  country: { select: { id: true, nameFa: true, nameEn: true } },
  economicJob: { select: { id: true, title: true, groupId: true } },
} satisfies Prisma.UserSelect;

type IdentityRow = Prisma.UserGetPayload<{ select: typeof identitySelect }>;

function decimalText(value: Prisma.Decimal | null) {
  return value == null ? null : value.toString();
}

function mapLocation(user: IdentityRow) {
  return {
    cityId: user.premiseCityId,
    establishment: user.premiseEstablishment,
    complexId: user.premiseComplexId,
    address: user.premiseAddress,
    plaque: user.premisePlaque,
    plaqueSeries: user.premisePlaqueSeries,
    floor: user.premiseFloor,
    unitNo: user.premiseUnitNo,
    postalCode: user.premisePostalCode,
    phone: user.premisePhone,
    fax: user.premiseFax,
    geoPosition: user.premiseGeoPosition,
    publicAccess: user.premisePublicAccess,
    registrationPlaceId: user.registrationPlaceId,
    ownership: user.premiseOwnership,
    deedNo: user.premiseDeedNo,
    area: decimalText(user.premiseArea),
    leaseIssuedAt: dateOnly(user.leaseIssuedAt),
    leaseExpiresAt: dateOnly(user.leaseExpiresAt),
    leaseAgency: user.leaseAgency,
    ownerName: user.premiseOwnerName,
  };
}

function mapActivity(user: Pick<IdentityRow, 'businessUnitTitle' | 'previousOccupation' | 'posDeviceCount' | 'activityJob'>) {
  return {
    businessUnitTitle: user.businessUnitTitle,
    jobGroupId: user.activityJob?.groupId ?? null,
    jobId: user.activityJob?.id ?? null,
    previousOccupation: user.previousOccupation,
    posDeviceCount: user.posDeviceCount,
  };
}

function dateOnly(value: Date | null) {
  return value ? value.toISOString().slice(0, 10) : null;
}

function parseDate(value: string | null | undefined) {
  if (!value) return null;
  return new Date(`${value}T00:00:00.000Z`);
}

function mapIdentity(user: IdentityRow) {
  const {
    businessUnitTitle: _businessUnitTitle,
    previousOccupation: _previousOccupation,
    posDeviceCount: _posDeviceCount,
    activityJob: _activityJob,
    premiseCityId: _premiseCityId,
    premiseEstablishment: _premiseEstablishment,
    premiseComplexId: _premiseComplexId,
    premiseAddress: _premiseAddress,
    premisePlaque: _premisePlaque,
    premisePlaqueSeries: _premisePlaqueSeries,
    premiseFloor: _premiseFloor,
    premiseUnitNo: _premiseUnitNo,
    premisePostalCode: _premisePostalCode,
    premisePhone: _premisePhone,
    premiseFax: _premiseFax,
    premiseGeoPosition: _premiseGeoPosition,
    premisePublicAccess: _premisePublicAccess,
    registrationPlaceId: _registrationPlaceId,
    premiseOwnership: _premiseOwnership,
    premiseDeedNo: _premiseDeedNo,
    premiseArea: _premiseArea,
    leaseIssuedAt: _leaseIssuedAt,
    leaseExpiresAt: _leaseExpiresAt,
    leaseAgency: _leaseAgency,
    premiseOwnerName: _premiseOwnerName,
    birthDate,
    nationalCardExpiresAt,
    passportExpiresAt,
    ...rest
  } = user;
  return {
    ...rest,
    birthDate: dateOnly(birthDate),
    nationalCardExpiresAt: dateOnly(nationalCardExpiresAt),
    passportExpiresAt: dateOnly(passportExpiresAt),
  };
}

function jalaliYear(date = new Date()) {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  if (month < 3 || (month === 3 && day < 21)) return year - 622;
  return year - 621;
}

@Injectable()
export class CasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly files: PersonFileStorage,
    private readonly inquiries: CaseInquiriesService,
  ) {}

  private async ensureTrackingCode(userId: string, current: string | null, formationStep: number) {
    if (current || formationStep < 1) return current;
    const prefix = `CASE-${jalaliYear()}-`;
    for (let attempt = 0; attempt < 6; attempt++) {
      const count = await this.prisma.user.count({
        where: { caseTrackingCode: { startsWith: prefix } },
      });
      const code = `${prefix}${String(count + 1 + attempt).padStart(6, '0')}`;
      try {
        const updated = await this.prisma.user.updateMany({
          where: { id: userId, caseTrackingCode: null },
          data: { caseTrackingCode: code },
        });
        if (updated.count === 1) return code;
        const row = await this.prisma.user.findUnique({
          where: { id: userId },
          select: { caseTrackingCode: true },
        });
        return row?.caseTrackingCode ?? null;
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
          throw error;
        }
      }
    }
    throw new ConflictException('صدور کد رهگیری انجام نشد');
  }

  private async withTrackingCode(user: IdentityRow) {
    const caseTrackingCode = await this.ensureTrackingCode(
      user.id,
      user.caseTrackingCode,
      user.formationStep,
    );
    if (!caseTrackingCode || caseTrackingCode === user.caseTrackingCode) return user;
    return { ...user, caseTrackingCode };
  }

  async findIdentity(nationalIdRaw: string) {
    const nationalId = normalizeNationalId(nationalIdRaw || '');
    if (!/^\d{10}$/.test(nationalId)) {
      throw new BadRequestException('کد ملی معتبر نیست');
    }
    const user = await this.prisma.user.findUnique({
      where: { nationalId },
      select: identitySelect,
    });
    if (!user) return { found: false as const, person: null, activity: null, location: null };
    const tracked = await this.withTrackingCode(user);
    return {
      found: true as const,
      person: mapIdentity(tracked),
      activity: mapActivity(tracked),
      location: mapLocation(tracked),
    };
  }

  async saveIdentity(dto: SaveCaseIdentityDto) {
    const nationalId = normalizeNationalId(dto.nationalId);
    await this.assertCountry(dto.countryId);
    await this.assertJob(dto.jobId);
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
      select: { id: true, formationStep: true },
    });
    const formationStep = Math.max(existing?.formationStep ?? 0, 1);
    if (existing) {
      const user = await this.prisma.user.update({
        where: { id: existing.id },
        data: { ...data, formationStep },
        select: identitySelect,
      });
      return mapIdentity(await this.withTrackingCode(user));
    }

    const passwordHash = await bcrypt.hash(randomBytes(18).toString('hex'), 10);
    const user = await this.prisma.user.create({
      data: {
        ...data,
        formationStep,
        username: `nid${nationalId}`,
        passwordHash,
        nationalId,
        locale: 'fa',
        status: UserStatus.ACTIVE,
      },
      select: identitySelect,
    });
    return mapIdentity(await this.withTrackingCode(user));
  }

  async saveActivity(dto: SaveCaseActivityDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: dto.userId },
      select: { id: true, formationStep: true },
    });
    if (!user) throw new NotFoundException('شخص یافت نشد');
    const job = await this.prisma.job.findUnique({
      where: { id: dto.jobId },
      select: { id: true, groupId: true },
    });
    if (!job) throw new BadRequestException('شغل معتبر نیست');
    if (dto.jobGroupId && job.groupId !== dto.jobGroupId) {
      throw new BadRequestException('شغل با گروه شغلی انتخاب‌شده هم‌خوان نیست');
    }
    const saved = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        businessUnitTitle: dto.businessUnitTitle.trim(),
        activityJobId: job.id,
        previousOccupation: (dto.previousOccupation ?? null) as PreviousOccupation | null,
        posDeviceCount: dto.posDeviceCount ?? null,
        formationStep: Math.max(user.formationStep, 2),
      },
      select: identitySelect,
    });
    return { formationStep: saved.formationStep, activity: mapActivity(saved) };
  }

  async saveLocation(dto: SaveCaseLocationDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: dto.userId },
      select: { id: true, formationStep: true },
    });
    if (!user) throw new NotFoundException('شخص یافت نشد');
    const city = await this.prisma.city.findUnique({
      where: { id: dto.cityId },
      select: { id: true },
    });
    if (!city) throw new BadRequestException('شهر معتبر نیست');
    const complex =
      dto.establishment === 'RESIDENTIAL_COMPLEX' ? dto.complexId ?? null : null;
    if (dto.establishment === 'RESIDENTIAL_COMPLEX' && !complex) {
      throw new BadRequestException('مجتمع را انتخاب کنید');
    }
    if (complex) {
      const row = await this.prisma.commercialComplex.findUnique({
        where: { id: complex },
        select: { id: true },
      });
      if (!row) throw new BadRequestException('مجتمع معتبر نیست');
    }
    if (dto.registrationPlaceId) {
      const place = await this.prisma.registrationPlace.findUnique({
        where: { id: dto.registrationPlaceId },
        select: { id: true },
      });
      if (!place) throw new BadRequestException('محل ثبت پرونده معتبر نیست');
    }
    const rented = dto.ownership === 'RENTED';
    const digits = (value?: string | null) => value?.replace(/\D/g, '') || null;
    const saved = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        premiseCityId: dto.cityId,
        premiseEstablishment: dto.establishment as PremiseEstablishment,
        premiseComplexId: complex,
        premiseAddress: dto.address?.trim() || null,
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
        premiseOwnership: dto.ownership as PremiseOwnership,
        premiseDeedNo: dto.deedNo?.trim() || null,
        premiseArea: dto.area ?? null,
        leaseIssuedAt: rented ? parseDate(dto.leaseIssuedAt) : null,
        leaseExpiresAt: rented ? parseDate(dto.leaseExpiresAt) : null,
        leaseAgency: rented ? dto.leaseAgency?.trim() || null : null,
        premiseOwnerName: rented ? dto.ownerName?.trim() || null : null,
        formationStep: Math.max(user.formationStep, 3),
      },
      select: identitySelect,
    });
    return { formationStep: saved.formationStep, location: mapLocation(saved) };
  }

  async advanceStep(dto: SaveFormationStepDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: dto.userId },
      select: { id: true, formationStep: true },
    });
    if (!user) throw new NotFoundException('شخص یافت نشد');
    const requested = Math.min(dto.step, user.formationStep + 1);
    if (user.formationStep < PLACES_FORMATION_STEP && requested >= PLACES_FORMATION_STEP) {
      await this.assertActivityDocumentsDelivered(user.id);
      await this.inquiries.assertDelivered(user.id);
    }
    const formationStep = Math.max(user.formationStep, requested);
    return this.prisma.user.update({
      where: { id: user.id },
      data: { formationStep },
      select: { id: true, formationStep: true },
    });
  }

  /** بعد از ثبت آخرین نتیجهٔ استعلام، اگر مدارک شغل هم آماده باشد پرونده به اماکن می‌رود. */
  async advanceToPlacesAfterInquiry(inquiryId: string) {
    const inquiry = await this.prisma.caseInquiry.findUnique({
      where: { id: inquiryId },
      select: { userId: true },
    });
    if (!inquiry) return null;
    const user = await this.prisma.user.findUnique({
      where: { id: inquiry.userId },
      select: { id: true, formationStep: true },
    });
    if (!user || user.formationStep !== PLACES_FORMATION_STEP - 1) return null;
    const [total, pending] = await Promise.all([
      this.prisma.caseInquiry.count({ where: { userId: user.id } }),
      this.prisma.caseInquiry.count({
        where: { userId: user.id, status: CaseInquiryStatus.PENDING },
      }),
    ]);
    if (total === 0 || pending > 0) return null;
    await this.assertActivityDocumentsDelivered(user.id);
    await this.inquiries.assertDelivered(user.id);
    return this.prisma.user.update({
      where: { id: user.id },
      data: { formationStep: PLACES_FORMATION_STEP },
      select: { id: true, formationStep: true },
    });
  }

  async list(query: FindCasesQueryDto) {
    const q = query.q?.trim();
    const digits = q ? normalizeSearchDigits(q) : '';
    const where: Prisma.UserWhereInput = {
      formationStep: query.step != null ? query.step : { gt: 0 },
      gender: query.gender,
      residencyStatus: query.residencyStatus,
      educationLevel: query.educationLevel,
      jobId: query.jobId,
      OR: q
        ? [
            { fullName: containsInsensitive(q) },
            { firstName: containsInsensitive(q) },
            { lastName: containsInsensitive(q) },
            { fatherName: containsInsensitive(q) },
            ...(digits
              ? [
                  { nationalId: { contains: digits } },
                  { phone: { contains: digits } },
                ]
              : []),
          ]
        : undefined,
    };
    const orderBy = resolveSortOrder<Prisma.UserOrderByWithRelationInput>(
      query.sortBy,
      query.sortDir,
      {
        fullName: (dir) => ({ fullName: dir }),
        fatherName: (dir) => ({ fatherName: dir }),
        nationalId: (dir) => ({ nationalId: dir }),
        phone: (dir) => ({ phone: dir }),
        gender: (dir) => ({ gender: dir }),
        residencyStatus: (dir) => ({ residencyStatus: dir }),
        educationLevel: (dir) => ({ educationLevel: dir }),
        job: (dir) => ({ economicJob: { title: dir } }),
        formationStep: (dir) => ({ formationStep: dir }),
      },
      [{ createdAt: 'desc' }, { id: 'asc' }],
    );
    const select = {
      id: true,
      fullName: true,
      fatherName: true,
      nationalId: true,
      gender: true,
      phone: true,
      residencyStatus: true,
      educationLevel: true,
      formationStep: true,
      economicJob: { select: { id: true, title: true } },
    } satisfies Prisma.UserSelect;

    const mapRow = <T extends { economicJob: { id: string; title: string } | null }>(row: T) => {
      const { economicJob, ...rest } = row;
      return { ...rest, job: economicJob };
    };

    if (!wantsPagination(query)) {
      const items = await this.prisma.user.findMany({ where, orderBy, select });
      return items.map(mapRow);
    }
    const { page, pageSize, skip, take } = paginationArgs(query);
    const [items, total] = await Promise.all([
      this.prisma.user.findMany({ where, orderBy, skip, take, select }),
      this.prisma.user.count({ where }),
    ]);
    return paginatedResult(items.map(mapRow), total, page, pageSize);
  }

  async documentTypes() {
    return this.prisma.document.findMany({
      where: { code: { not: null } },
      orderBy: { title: 'asc' },
      select: {
        id: true,
        code: true,
        title: true,
        isRequired: true,
        gender: true,
        isFixed: true,
      },
    });
  }

  async personDocuments(userId: string) {
    await this.assertPerson(userId);
    const rows = await this.prisma.personDocument.findMany({
      where: { userId },
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
      documentId: row.documentId,
      current: row.versions[0] ?? null,
    }));
  }

  async uploadDocument(input: {
    userId: string;
    documentId: string;
    jobId?: string;
    buffer: Buffer;
    mimeType: string;
    originalName: string;
  }) {
    await this.assertPerson(input.userId);
    const document = await this.prisma.document.findUnique({
      where: { id: input.documentId },
      select: { id: true, code: true, isFixed: true, isRequired: true },
    });
    if (!document) throw new NotFoundException('مدرک یافت نشد');
    if (input.jobId) {
      const allowed = await this.isActivityDocument(document, input.jobId);
      if (!allowed) throw new NotFoundException('این مدرک برای شغل انتخاب‌شده نیست');
    } else if (!document.code) {
      throw new NotFoundException('نوع مدرک هویتی یافت نشد');
    }

    const personDocument = await this.prisma.personDocument.upsert({
      where: {
        userId_documentId: { userId: input.userId, documentId: document.id },
      },
      create: { userId: input.userId, documentId: document.id },
      update: {},
      select: {
        id: true,
        versions: { select: { version: true }, orderBy: { version: 'desc' }, take: 1 },
      },
    });
    const version = (personDocument.versions[0]?.version ?? 0) + 1;
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
    return { documentId: document.id, current: created };
  }

  async readDocumentFile(versionId: string) {
    const version = await this.prisma.personDocumentVersion.findUnique({
      where: { id: versionId },
    });
    if (!version) throw new NotFoundException('فایل مدرک یافت نشد');
    const data = await this.files.read(version.storageKey);
    return { ...version, data };
  }

  private matchesDocumentGender(
    gender: DocumentGender,
    personGender: 'MALE' | 'FEMALE' | null,
  ) {
    return gender === DocumentGender.BOTH || !personGender || gender === personGender;
  }

  private async isActivityDocument(
    document: { id: string; isFixed: boolean; isRequired: boolean },
    jobId: string,
  ) {
    if (document.isFixed && document.isRequired) return true;
    const link = await this.prisma.jobDocument.findUnique({
      where: { jobId_documentId: { jobId, documentId: document.id } },
      select: { documentId: true },
    });
    return Boolean(link);
  }

  private async assertActivityDocumentsDelivered(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { activityJobId: true, gender: true },
    });
    if (!user?.activityJobId) {
      throw new BadRequestException('قبل از مرحله اماکن باید شغل و مدارک آن تکمیل شود');
    }
    const [fixed, links, stored] = await Promise.all([
      this.prisma.document.findMany({
        where: { isFixed: true, isRequired: true },
        select: { id: true, gender: true },
      }),
      this.prisma.jobDocument.findMany({
        where: { jobId: user.activityJobId },
        select: { documentId: true, gender: true, isRequired: true },
      }),
      this.prisma.personDocument.findMany({
        where: { userId },
        select: {
          documentId: true,
          versions: { select: { id: true }, take: 1 },
        },
      }),
    ]);
    const required = new Set<string>();
    for (const doc of fixed) {
      if (this.matchesDocumentGender(doc.gender, user.gender)) required.add(doc.id);
    }
    for (const link of links) {
      if (required.has(link.documentId) || !link.isRequired) continue;
      if (!this.matchesDocumentGender(link.gender, user.gender)) continue;
      required.add(link.documentId);
    }
    const uploaded = new Set(
      stored.filter((row) => row.versions.length > 0).map((row) => row.documentId),
    );
    for (const id of required) {
      if (!uploaded.has(id)) {
        throw new BadRequestException(
          'قبل از مرحله اماکن همه مدارک الزامی این شغل باید بارگذاری شده باشند',
        );
      }
    }
  }

  private async assertPerson(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) throw new NotFoundException('شخص یافت نشد');
  }

  private async assertCountry(countryId?: string | null) {
    if (!countryId) return;
    const country = await this.prisma.country.findUnique({
      where: { id: countryId },
      select: { id: true },
    });
    if (!country) throw new BadRequestException('ملیت انتخاب‌شده معتبر نیست');
  }

  private async assertJob(jobId?: string | null) {
    if (!jobId) return;
    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
      select: { id: true },
    });
    if (!job) throw new BadRequestException('شغل معتبر نیست');
  }

  private async assertUniqueContact(
    nationalId: string,
    phone: string | null,
    email: string | null,
  ) {
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
