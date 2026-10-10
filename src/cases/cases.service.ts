import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { ECONOMIC_ACTOR_ROLE_CODE, ensureEconomicActorRole } from '../access/access.constants';
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
  CaseRequestType,
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
import { CasePlacesService } from './case-places.service';
import { CaseGeneralSettingsService } from './case-general-settings.service';
import { CaseManagementApproversService } from './case-management-approvers.service';
import {
  ISSUANCE_FORMATION_STEP,
  MANAGEMENT_FORMATION_STEP,
  PLACES_FORMATION_STEP,
  syncIssuanceRequest,
} from './formation-steps';
import {
  alignStoredRenewalTerms,
  completeOpenRequest,
  findOpenRequest,
  isProcessType,
  openProcessRequest,
  resolveDocumentRequirements,
} from './request-process';

/** رمز اولیهٔ فعال اقتصادی؛ فقط هنگام ساخت حساب تازه از تشکیل پرونده */
const ECONOMIC_ACTOR_INITIAL_PASSWORD = '11111111';

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

const caseFileSelect = {
  id: true,
  userId: true,
  formationStep: true,
  trackingCode: true,
  businessUnitTitle: true,
  previousOccupation: true,
  posDeviceCount: true,
  activityJob: {
    select: {
      id: true,
      title: true,
      groupId: true,
      group: { select: { title: true } },
      jobType: { select: { title: true } },
    },
  },
  premiseCityId: true,
  premiseEstablishment: true,
  premiseComplexId: true,
  premiseAddress: true,
  premiseAddressEn: true,
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
} satisfies Prisma.CaseFileSelect;

type PersonRow = Prisma.UserGetPayload<{ select: typeof personSelect }>;
type CaseFileRow = Prisma.CaseFileGetPayload<{ select: typeof caseFileSelect }>;

function decimalText(value: Prisma.Decimal | null) {
  return value == null ? null : value.toString();
}

function mapLocation(user: CaseFileRow) {
  return {
    cityId: user.premiseCityId,
    establishment: user.premiseEstablishment,
    complexId: user.premiseComplexId,
    address: user.premiseAddress,
    addressEn: user.premiseAddressEn,
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

function mapActivity(user: Pick<CaseFileRow, 'businessUnitTitle' | 'previousOccupation' | 'posDeviceCount' | 'activityJob'>) {
  return {
    businessUnitTitle: user.businessUnitTitle,
    jobGroupId: user.activityJob?.groupId ?? null,
    jobGroupTitle: user.activityJob?.group?.title ?? null,
    jobId: user.activityJob?.id ?? null,
    jobTitle: user.activityJob?.title ?? null,
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

function mapIdentity(user: PersonRow) {
  const { birthDate, nationalCardExpiresAt, passportExpiresAt, ...rest } = user;
  return {
    ...rest,
    birthDate: dateOnly(birthDate),
    nationalCardExpiresAt: dateOnly(nationalCardExpiresAt),
    passportExpiresAt: dateOnly(passportExpiresAt),
  };
}

function mapCase(file: CaseFileRow) {
  return {
    id: file.id,
    formationStep: file.formationStep,
    trackingCode: file.trackingCode,
    activity: mapActivity(file),
    location: mapLocation(file),
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
    private readonly places: CasePlacesService,
    private readonly managementApprovers: CaseManagementApproversService,
    private readonly generalSettings: CaseGeneralSettingsService,
  ) {}

  private async ensureTrackingCode(caseFileId: string, current: string | null, formationStep: number) {
    if (current || formationStep < 1) return current;
    const prefix = `CASE-${jalaliYear()}-`;
    for (let attempt = 0; attempt < 6; attempt++) {
      const count = await this.prisma.caseFile.count({
        where: { trackingCode: { startsWith: prefix } },
      });
      const code = `${prefix}${String(count + 1 + attempt).padStart(6, '0')}`;
      try {
        const updated = await this.prisma.caseFile.updateMany({
          where: { id: caseFileId, trackingCode: null },
          data: { trackingCode: code },
        });
        if (updated.count === 1) return code;
        const row = await this.prisma.caseFile.findUnique({
          where: { id: caseFileId },
          select: { trackingCode: true },
        });
        return row?.trackingCode ?? null;
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
          throw error;
        }
      }
    }
    throw new ConflictException('صدور کد رهگیری انجام نشد');
  }

  private async attachTrackingCode(file: { id: string; formationStep: number; trackingCode: string | null }) {
    const trackingCode = await this.ensureTrackingCode(file.id, file.trackingCode, file.formationStep);
    return { ...file, trackingCode };
  }

  async findIdentity(nationalIdRaw: string, caseId?: string) {
    const nationalId = normalizeNationalId(nationalIdRaw || '');
    if (!/^\d{10}$/.test(nationalId)) {
      throw new BadRequestException('کد ملی معتبر نیست');
    }
    const user = await this.prisma.user.findUnique({
      where: { nationalId },
      select: personSelect,
    });
    if (!user) {
      return {
        found: false as const,
        person: null,
        openCase: null,
        requestedCase: null,
        hasIssuedCase: false,
      };
    }
    const files = await this.prisma.caseFile.findMany({
      where: { userId: user.id },
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      select: caseFileSelect,
    });
    const open = files.find((file) => file.formationStep < ISSUANCE_FORMATION_STEP) ?? null;
    const requested = caseId ? files.find((file) => file.id === caseId) ?? null : null;
    return {
      found: true as const,
      person: mapIdentity(user),
      openCase: open ? mapCase(open) : null,
      requestedCase: requested ? mapCase(requested) : null,
      hasIssuedCase: files.some((file) => file.formationStep >= ISSUANCE_FORMATION_STEP),
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
      select: { id: true },
    });
    const user = existing
      ? await this.prisma.user.update({
          where: { id: existing.id },
          data,
          select: personSelect,
        })
      : await this.createEconomicActor(nationalId, data);
    const file = await this.resolveCaseFile(user.id, dto.caseId, dto.startNew === true);
    return {
      ...mapIdentity(user),
      caseId: file.id,
      formationStep: file.formationStep,
      caseTrackingCode: file.trackingCode,
    };
  }

  private async createEconomicActor(
    nationalId: string,
    data: Prisma.UserUpdateInput,
  ) {
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

  private async resolveCaseFile(userId: string, caseId: string | null | undefined, startNew: boolean) {
    if (caseId) {
      const row = await this.prisma.caseFile.findFirst({
        where: { id: caseId, userId },
        select: { id: true, formationStep: true, trackingCode: true },
      });
      if (!row) throw new BadRequestException('پرونده متعلق به این شخص نیست');
      return this.bumpIdentityStep(row);
    }
    if (!startNew) {
      const open = await this.prisma.caseFile.findFirst({
        where: { userId, formationStep: { lt: ISSUANCE_FORMATION_STEP } },
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        select: { id: true, formationStep: true, trackingCode: true },
      });
      if (open) return this.bumpIdentityStep(open);
    }
    const created = await this.prisma.caseFile.create({
      data: { userId, formationStep: 1 },
      select: { id: true, formationStep: true, trackingCode: true },
    });
    const tracked = await this.attachTrackingCode(created);
    await syncIssuanceRequest(this.prisma, tracked.id);
    return tracked;
  }

  private async bumpIdentityStep(row: { id: string; formationStep: number; trackingCode: string | null }) {
    const formationStep = Math.max(row.formationStep, 1);
    if (formationStep !== row.formationStep) {
      await this.prisma.caseFile.update({
        where: { id: row.id },
        data: { formationStep },
      });
    }
    const tracked = await this.attachTrackingCode({ ...row, formationStep });
    await syncIssuanceRequest(this.prisma, tracked.id);
    return tracked;
  }

  /** پروندهٔ صادرشده فقط برای نقش انتخاب‌شده در تنظیمات کلی قابل ویرایش است. شماره مجوز ثابت می‌ماند. */
  private async assertIssuedCaseEditable(licenseNumber: string | null, userId: string) {
    if (!licenseNumber) return;
    const allowed = await this.generalSettings.userMayEditIssuedCase(userId);
    if (allowed === true) return;
    throw new BadRequestException(
      allowed === false
        ? 'ویرایش پرونده صادرشده فقط برای نقش تعیین‌شده مجاز است'
        : 'مجوز فعالیت اقتصادی این پرونده صادر شده است',
    );
  }

  async saveActivity(dto: SaveCaseActivityDto, userId: string) {
    const user = await this.prisma.caseFile.findUnique({
      where: { id: dto.caseId },
      select: { id: true, formationStep: true, licenseNumber: true },
    });
    if (!user) throw new NotFoundException('پرونده یافت نشد');
    await this.assertIssuedCaseEditable(user.licenseNumber, userId);
    const job = await this.prisma.job.findUnique({
      where: { id: dto.jobId },
      select: { id: true, groupId: true },
    });
    if (!job) throw new BadRequestException('شغل معتبر نیست');
    if (dto.jobGroupId && job.groupId !== dto.jobGroupId) {
      throw new BadRequestException('شغل با گروه شغلی انتخاب‌شده هم‌خوان نیست');
    }
    const saved = await this.prisma.caseFile.update({
      where: { id: user.id },
      data: {
        businessUnitTitle: dto.businessUnitTitle.trim(),
        activityJobId: job.id,
        previousOccupation: (dto.previousOccupation ?? null) as PreviousOccupation | null,
        posDeviceCount: dto.posDeviceCount ?? null,
        formationStep: Math.max(user.formationStep, 2),
      },
      select: caseFileSelect,
    });
    await syncIssuanceRequest(this.prisma, saved.id);
    return { formationStep: saved.formationStep, activity: mapActivity(saved) };
  }

  async saveLocation(dto: SaveCaseLocationDto, userId: string) {
    const user = await this.prisma.caseFile.findUnique({
      where: { id: dto.caseId },
      select: { id: true, formationStep: true, licenseNumber: true },
    });
    if (!user) throw new NotFoundException('پرونده یافت نشد');
    await this.assertIssuedCaseEditable(user.licenseNumber, userId);
    const city = await this.prisma.city.findUnique({
      where: { id: dto.cityId },
      select: { id: true },
    });
    if (!city) throw new BadRequestException('شهر معتبر نیست');
    const complex =
      dto.establishment === 'COMMERCIAL_COMPLEX' ? dto.complexId ?? null : null;
    if (dto.establishment === 'COMMERCIAL_COMPLEX' && !complex) {
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
    const saved = await this.prisma.caseFile.update({
      where: { id: user.id },
      data: {
        premiseCityId: dto.cityId,
        premiseEstablishment: dto.establishment as PremiseEstablishment,
        premiseComplexId: complex,
        premiseAddress: dto.address?.trim() || null,
        premiseAddressEn: dto.addressEn?.trim() || null,
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
      select: caseFileSelect,
    });
    await syncIssuanceRequest(this.prisma, saved.id);
    return { formationStep: saved.formationStep, location: mapLocation(saved) };
  }

  async openRequest(caseId: string, type: string) {
    if (!isProcessType(type) || type === CaseRequestType.ISSUANCE) {
      throw new BadRequestException('این نوع درخواست از اینجا ساخته نمی‌شود');
    }
    return openProcessRequest(this.prisma, caseId, type);
  }

  async processState(caseId: string) {
    const request = await findOpenRequest(this.prisma, caseId);
    if (!request || !isProcessType(request.type) || request.type === CaseRequestType.ISSUANCE) {
      throw new NotFoundException('درخواست باز یافت نشد');
    }
    const [storedTerms, draft, file] = await Promise.all([
      request.type === CaseRequestType.RENEWAL
        ? this.prisma.caseRenewalTerms.findUnique({ where: { requestId: request.id } })
        : Promise.resolve(null),
      request.type === CaseRequestType.LOCATION_CHANGE
        ? this.prisma.caseLocationDraft.findUnique({ where: { requestId: request.id } })
        : Promise.resolve(null),
      this.prisma.caseFile.findUnique({
        where: { id: caseId },
        select: {
          id: true,
          licenseNumber: true,
          userId: true,
          businessUnitTitle: true,
          activityJob: { select: { title: true, group: { select: { title: true } } } },
        },
      }),
    ]);
    const terms =
      request.type === CaseRequestType.RENEWAL && storedTerms
        ? await alignStoredRenewalTerms(this.prisma, request.id, storedTerms)
        : storedTerms;
    const date = (value: Date | null | undefined) => (value ? value.toISOString().slice(0, 10) : null);
    return {
      id: request.id,
      caseId,
      userId: file?.userId ?? null,
      number: request.number,
      type: request.type,
      status: request.status,
      formationStep: request.formationStep,
      licenseNumber: file?.licenseNumber ?? null,
      businessUnitTitle: file?.businessUnitTitle ?? null,
      jobGroupTitle: file?.activityJob?.group?.title ?? null,
      jobTitle: file?.activityJob?.title ?? null,
      renewal: terms
        ? {
            currentIssuedAt: date(terms.currentIssuedAt),
            currentExpiresAt: date(terms.currentExpiresAt),
            nextIssuedAt: date(terms.nextIssuedAt),
            nextExpiresAt: date(terms.nextExpiresAt),
            delayDays: terms.delayDays,
          }
        : null,
      location: draft
        ? {
            cityId: draft.premiseCityId,
            establishment: draft.premiseEstablishment,
            complexId: draft.premiseComplexId,
            address: draft.premiseAddress,
            addressEn: draft.premiseAddressEn,
            plaque: draft.premisePlaque,
            plaqueSeries: draft.premisePlaqueSeries,
            floor: draft.premiseFloor,
            unitNo: draft.premiseUnitNo,
            postalCode: draft.premisePostalCode,
            phone: draft.premisePhone,
            fax: draft.premiseFax,
            geoPosition: draft.premiseGeoPosition,
            publicAccess: draft.premisePublicAccess,
            registrationPlaceId: draft.registrationPlaceId,
            ownership: draft.premiseOwnership,
            deedNo: draft.premiseDeedNo,
            area: draft.premiseArea == null ? null : Number(draft.premiseArea),
            leaseIssuedAt: date(draft.leaseIssuedAt),
            leaseExpiresAt: date(draft.leaseExpiresAt),
            leaseAgency: draft.leaseAgency,
            ownerName: draft.premiseOwnerName,
          }
        : null,
    };
  }

  async saveLocationDraft(dto: SaveCaseLocationDto) {
    const request = await findOpenRequest(this.prisma, dto.caseId);
    if (!request || request.type !== CaseRequestType.LOCATION_CHANGE) {
      throw new BadRequestException('درخواست تغییر مکان باز نیست');
    }
    const city = await this.prisma.city.findUnique({ where: { id: dto.cityId }, select: { id: true } });
    if (!city) throw new BadRequestException('شهر معتبر نیست');
    const complex = dto.establishment === 'COMMERCIAL_COMPLEX' ? dto.complexId ?? null : null;
    if (dto.establishment === 'COMMERCIAL_COMPLEX' && !complex) {
      throw new BadRequestException('مجتمع را انتخاب کنید');
    }
    const rented = dto.ownership === 'RENTED';
    const digits = (value?: string | null) => value?.replace(/\D/g, '') || null;
    await this.prisma.caseLocationDraft.update({
      where: { requestId: request.id },
      data: {
        premiseCityId: dto.cityId,
        premiseEstablishment: dto.establishment as PremiseEstablishment,
        premiseComplexId: complex,
        premiseAddress: dto.address?.trim() || null,
        premiseAddressEn: dto.addressEn?.trim() || null,
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
      },
    });
    if (request.formationStep < 1) {
      await this.prisma.caseRequest.update({
        where: { id: request.id },
        data: { formationStep: 1 },
      });
    }
    return this.processState(dto.caseId);
  }

  async advanceProcess(caseId: string, step: number) {
    const request = await findOpenRequest(this.prisma, caseId);
    if (!request || request.type === CaseRequestType.ISSUANCE || !isProcessType(request.type)) {
      throw new BadRequestException('درخواست تمدید یا تغییر مکان باز نیست');
    }
    const requested = Math.min(Math.max(step, 0), 3);
    const next = Math.max(request.formationStep, Math.min(requested, request.formationStep + 1));
    if (request.type === CaseRequestType.LOCATION_CHANGE && next >= 1) {
      const draft = await this.prisma.caseLocationDraft.findUnique({ where: { requestId: request.id } });
      if (!draft?.premiseCityId || !draft.premiseAddress || !draft.premiseOwnership) {
        throw new BadRequestException('اطلاعات محل جدید کامل نیست');
      }
    }
    if (next >= 2) await this.assertActivityDocumentsDelivered(caseId);
    if (next >= 3) await this.inquiries.assertDelivered(caseId);
    const saved = await this.prisma.caseRequest.update({
      where: { id: request.id },
      data: { formationStep: next },
      select: { formationStep: true },
    });
    return saved;
  }

  async completeRequest(caseId: string, actorId?: string) {
    const request = await findOpenRequest(this.prisma, caseId);
    if (!request) throw new BadRequestException('درخواست بازی برای تکمیل نیست');
    if (request.type !== CaseRequestType.ISSUANCE && request.formationStep < 3) {
      throw new BadRequestException('مرحله‌های این درخواست هنوز تمام نشده است');
    }
    if (request.type !== CaseRequestType.ISSUANCE) {
      await this.inquiries.ensureForUser(caseId);
      await this.managementApprovers.ensureForUser(caseId);
    }
    if (request.type === CaseRequestType.ISSUANCE) {
      await this.places.ensureForUser(caseId);
      await this.managementApprovers.ensureForUser(caseId);
      await this.inquiries.ensureForUser(caseId);
    }
    return completeOpenRequest(this.prisma, caseId, actorId);
  }

  async advanceStep(dto: SaveFormationStepDto) {
    const open = await findOpenRequest(this.prisma, dto.caseId);
    if (open && open.type !== CaseRequestType.ISSUANCE) {
      throw new BadRequestException('درخواست باز این پرونده صدور نیست');
    }
    const user = await this.prisma.caseFile.findUnique({
      where: { id: dto.caseId },
      select: { id: true, formationStep: true },
    });
    if (!user) throw new NotFoundException('پرونده یافت نشد');
    const requested = Math.min(dto.step, user.formationStep + 1);
    if (user.formationStep < PLACES_FORMATION_STEP && requested >= PLACES_FORMATION_STEP) {
      await this.assertActivityDocumentsDelivered(user.id);
      await this.inquiries.assertDelivered(user.id);
    }
    if (user.formationStep < MANAGEMENT_FORMATION_STEP && requested >= MANAGEMENT_FORMATION_STEP) {
      await this.places.assertDelivered(user.id);
    }
    if (user.formationStep < ISSUANCE_FORMATION_STEP && requested >= ISSUANCE_FORMATION_STEP) {
      await this.managementApprovers.assertDelivered(user.id);
    }
    const formationStep = Math.max(user.formationStep, requested);
    const saved = await this.prisma.caseFile.update({
      where: { id: user.id },
      data: { formationStep },
      select: { id: true, formationStep: true },
    });
    await syncIssuanceRequest(this.prisma, saved.id);
    return saved;
  }

  /** بعد از ثبت آخرین نتیجهٔ استعلام، اگر مدارک شغل هم آماده باشد پرونده به اماکن می‌رود. */
  async advanceToPlacesAfterInquiry(inquiryId: string) {
    const inquiry = await this.prisma.caseInquiry.findUnique({
      where: { id: inquiryId },
      select: { caseFileId: true, caseRequestId: true, caseRequest: { select: { type: true } } },
    });
    if (!inquiry || inquiry.caseRequest.type !== CaseRequestType.ISSUANCE) return null;
    const user = await this.prisma.caseFile.findUnique({
      where: { id: inquiry.caseFileId },
      select: { id: true, formationStep: true },
    });
    if (!user || user.formationStep !== PLACES_FORMATION_STEP - 1) return null;
    const [total, pending] = await Promise.all([
      this.prisma.caseInquiry.count({ where: { caseRequestId: inquiry.caseRequestId } }),
      this.prisma.caseInquiry.count({
        where: { caseRequestId: inquiry.caseRequestId, status: CaseInquiryStatus.PENDING },
      }),
    ]);
    if (total === 0 || pending > 0) return null;
    await this.assertActivityDocumentsDelivered(user.id);
    await this.inquiries.assertDelivered(user.id);
    await this.places.ensureForUser(user.id);
    const saved = await this.prisma.caseFile.update({
      where: { id: user.id },
      data: { formationStep: PLACES_FORMATION_STEP },
      select: { id: true, formationStep: true },
    });
    await syncIssuanceRequest(this.prisma, saved.id);
    return saved;
  }

  async list(query: FindCasesQueryDto) {
    const q = query.q?.trim();
    const digits = q ? normalizeSearchDigits(q) : '';
    const where: Prisma.CaseFileWhereInput = {
      userId: query.userId,
      formationStep: query.step != null ? query.step : { gt: 0 },
      activityJobId: query.jobId,
      user: {
        gender: query.gender,
        residencyStatus: query.residencyStatus,
        educationLevel: query.educationLevel,
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
      },
    };
    const orderBy = resolveSortOrder<Prisma.CaseFileOrderByWithRelationInput>(
      query.sortBy,
      query.sortDir,
      {
        fullName: (dir) => ({ user: { fullName: dir } }),
        fatherName: (dir) => ({ user: { fatherName: dir } }),
        nationalId: (dir) => ({ user: { nationalId: dir } }),
        phone: (dir) => ({ user: { phone: dir } }),
        gender: (dir) => ({ user: { gender: dir } }),
        residencyStatus: (dir) => ({ user: { residencyStatus: dir } }),
        educationLevel: (dir) => ({ user: { educationLevel: dir } }),
        job: (dir) => ({ activityJob: { title: dir } }),
        jobTitle: (dir) => ({ businessUnitTitle: dir }),
        formationStep: (dir) => ({ formationStep: dir }),
      },
      [{ createdAt: 'desc' }, { id: 'asc' }],
    );
    const select = {
      id: true,
      formationStep: true,
      trackingCode: true,
      businessUnitTitle: true,
      licenseNumber: true,
      licenseIssuedAt: true,
      licenseExpiresAt: true,
      premiseOwnership: true,
      leaseIssuedAt: true,
      leaseExpiresAt: true,
      activityJob: {
        select: {
          id: true,
          title: true,
          group: { select: { id: true, title: true } },
        },
      },
      premiseCity: { select: { nameFa: true, nameEn: true } },
      user: {
        select: {
          fullName: true,
          fatherName: true,
          nationalId: true,
          gender: true,
          phone: true,
          residencyStatus: true,
          educationLevel: true,
        },
      },
    } satisfies Prisma.CaseFileSelect;

    const mapRow = (row: Prisma.CaseFileGetPayload<{ select: typeof select }>) => ({
      id: row.id,
      formationStep: row.formationStep,
      trackingCode: row.trackingCode,
      licenseNumber: row.licenseNumber,
      licenseIssuedAt: dateOnly(row.licenseIssuedAt),
      licenseExpiresAt: dateOnly(row.licenseExpiresAt),
      premiseOwnership: row.premiseOwnership,
      leaseIssuedAt: dateOnly(row.leaseIssuedAt),
      leaseExpiresAt: dateOnly(row.leaseExpiresAt),
      fullName: row.user.fullName,
      fatherName: row.user.fatherName,
      nationalId: row.user.nationalId,
      gender: row.user.gender,
      phone: row.user.phone,
      residencyStatus: row.user.residencyStatus,
      educationLevel: row.user.educationLevel,
      job: row.activityJob,
      jobTitle: row.businessUnitTitle,
      city: row.premiseCity,
    });

    if (!wantsPagination(query)) {
      const items = await this.prisma.caseFile.findMany({ where, orderBy, select });
      return items.map(mapRow);
    }
    const { page, pageSize, skip, take } = paginationArgs(query);
    const [items, total] = await Promise.all([
      this.prisma.caseFile.findMany({ where, orderBy, skip, take, select }),
      this.prisma.caseFile.count({ where }),
    ]);
    return paginatedResult(items.map(mapRow), total, page, pageSize);
  }

  async findOne(id: string) {
    await syncIssuanceRequest(this.prisma, id);
    const file = await this.prisma.caseFile.findUnique({
      where: { id },
      select: {
        id: true,
        formationStep: true,
        trackingCode: true,
        businessUnitTitle: true,
        licenseNumber: true,
        licenseIssuedAt: true,
        licenseExpiresAt: true,
        premiseAddress: true,
        premisePlaque: true,
        premiseOwnership: true,
        premiseCity: { select: { nameFa: true, nameEn: true } },
        premiseHistory: {
          orderBy: [{ endedAt: 'asc' }, { id: 'asc' }],
          select: {
            id: true,
            startedAt: true,
            endedAt: true,
            premiseAddress: true,
            premisePlaque: true,
            premiseOwnership: true,
            premiseCity: { select: { nameFa: true, nameEn: true } },
          },
        },
        activityJob: {
          select: { id: true, title: true, group: { select: { id: true, title: true } } },
        },
        user: {
          select: {
            id: true,
            fullName: true,
            firstName: true,
            lastName: true,
            nationalId: true,
            phone: true,
          },
        },
        requests: {
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          select: {
            id: true,
            number: true,
            type: true,
            status: true,
            formationStep: true,
            completedAt: true,
            createdAt: true,
          },
        },
      },
    });
    if (!file || file.formationStep < 1) throw new NotFoundException('پرونده یافت نشد');
    const violationCount = file.user.nationalId
      ? await this.prisma.violation.count({ where: { nationalId: file.user.nationalId } })
      : 0;
    const premiseHistory = file.premiseHistory.map((row) => ({
      id: row.id,
      address: row.premiseAddress,
      plaque: row.premisePlaque,
      ownership: row.premiseOwnership,
      city: row.premiseCity,
      startedAt: dateOnly(row.startedAt),
      endedAt: dateOnly(row.endedAt),
    }));
    const currentStartedAt = file.premiseHistory.at(-1)?.endedAt ?? file.licenseIssuedAt;
    return {
      id: file.id,
      violationCount,
      formationStep: file.formationStep,
      trackingCode: file.trackingCode,
      businessUnitTitle: file.businessUnitTitle,
      licenseNumber: file.licenseNumber,
      licenseIssuedAt: dateOnly(file.licenseIssuedAt),
      licenseExpiresAt: dateOnly(file.licenseExpiresAt),
      city: file.premiseCity,
      premise:
        file.premiseAddress || file.premiseCity
          ? {
              address: file.premiseAddress,
              plaque: file.premisePlaque,
              ownership: file.premiseOwnership,
              city: file.premiseCity,
              startedAt: dateOnly(currentStartedAt),
            }
          : null,
      premiseHistory,
      job: file.activityJob,
      person: file.user,
      requests: file.requests.map((request) => ({
        ...request,
        completedAt: request.completedAt?.toISOString() ?? null,
        createdAt: request.createdAt.toISOString(),
      })),
    };
  }

  async licenseDocument(id: string) {
    await syncIssuanceRequest(this.prisma, id);
    const file = await this.prisma.caseFile.findUnique({
      where: { id },
      select: {
        id: true,
        formationStep: true,
        trackingCode: true,
        licenseNumber: true,
        licenseIssuedAt: true,
        licenseExpiresAt: true,
        businessUnitTitle: true,
        premiseAddress: true,
        premisePlaque: true,
        premiseFloor: true,
        premiseUnitNo: true,
        premisePostalCode: true,
        premisePhone: true,
        activityJob: { select: { title: true, titleEn: true } },
        premiseCity: { select: { nameFa: true, nameEn: true } },
        premiseComplex: { select: { name: true, nameEn: true } },
        requests: {
          where: { type: CaseRequestType.ISSUANCE },
          take: 1,
          select: { number: true },
        },
        user: {
          select: {
            firstName: true,
            lastName: true,
            lastNameEn: true,
            fatherName: true,
            birthDate: true,
            passportNumber: true,
            photoId: true,
            country: { select: { nameFa: true, nameEn: true } },
          },
        },
      },
    });
    if (!file || file.formationStep < 1) throw new NotFoundException('پرونده یافت نشد');
    if (!file.licenseNumber) {
      throw new NotFoundException('مجوز فعالیت اقتصادی هنوز صادر نشده است');
    }
    return {
      licenseNumber: file.licenseNumber,
      issuedAt: dateOnly(file.licenseIssuedAt),
      expiresAt: dateOnly(file.licenseExpiresAt),
      requestNumber: file.requests[0]?.number ?? null,
      trackingCode: file.trackingCode,
      firstName: file.user.firstName,
      lastName: file.user.lastName,
      lastNameEn: file.user.lastNameEn,
      fatherName: file.user.fatherName,
      birthDate: dateOnly(file.user.birthDate),
      nationalityFa: file.user.country?.nameFa ?? null,
      nationalityEn: file.user.country?.nameEn ?? null,
      passportNumber: file.user.passportNumber,
      phone: file.premisePhone,
      tradeName: file.businessUnitTitle,
      activityTitle: file.activityJob?.title ?? null,
      activityTitleEn: file.activityJob?.titleEn ?? null,
      photoId: file.user.photoId,
      address: file.premiseAddress,
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

  async remove(id: string) {
    const file = await this.prisma.caseFile.findUnique({
      where: { id },
      select: { id: true, userId: true, formationStep: true },
    });
    if (!file || file.formationStep < 1) {
      throw new NotFoundException('پرونده یافت نشد');
    }
    const activityFiles = await this.prisma.caseActivityDocumentVersion.findMany({
      where: { caseActivityDocument: { caseFileId: file.id } },
      select: { storageKey: true },
    });
    await this.prisma.caseFile.delete({ where: { id: file.id } });
    await this.removeStorageIfUnused(activityFiles.map((item) => item.storageKey));
    const remaining = await this.prisma.caseFile.count({ where: { userId: file.userId } });
    if (remaining > 0) return { ok: true };

    const user = await this.prisma.user.findUnique({
      where: { id: file.userId },
      select: {
        id: true,
        orgUnitId: true,
        positionId: true,
        workUnitId: true,
        staffPostId: true,
        photoId: true,
        nationalCardPhotoId: true,
        passportPhotoId: true,
        identityBookletPhotoId: true,
        userRoles: { select: { role: { select: { code: true } } } },
      },
    });
    if (!user) return { ok: true };

    const roleCodes = user.userRoles.map((item) => item.role.code);
    const caseAccountOnly =
      roleCodes.length > 0 &&
      roleCodes.every((code) => code === ECONOMIC_ACTOR_ROLE_CODE) &&
      !user.orgUnitId &&
      !user.positionId &&
      !user.workUnitId &&
      !user.staffPostId &&
      (await this.countCaseDeleteBlockers(user.id)) === 0;
    if (!caseAccountOnly) return { ok: true };

    const imageIds = [
      user.photoId,
      user.nationalCardPhotoId,
      user.passportPhotoId,
      user.identityBookletPhotoId,
    ];
    try {
      await this.prisma.user.delete({ where: { id: user.id } });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === 'P2003' || error.code === 'P2014')
      ) {
        return { ok: true };
      }
      throw error;
    }
    await this.files.removePerson(user.id);
    await this.deleteStoredImages(imageIds);
    return { ok: true };
  }

  private async countCaseDeleteBlockers(userId: string) {
    const [vehicles, activities, boardRequests, minutes, memberships, violations, proceedings] =
      await Promise.all([
        this.prisma.vehicleAssignment.count({ where: { personId: userId } }),
        this.prisma.singardActivity.count({ where: { createdById: userId } }),
        this.prisma.boardRequest.count({ where: { createdById: userId } }),
        this.prisma.boardMinutes.count({ where: { createdById: userId } }),
        this.prisma.boardMinutesMember.count({ where: { userId } }),
        this.prisma.violation.count({ where: { createdById: userId } }),
        this.prisma.violationProceeding.count({ where: { createdById: userId } }),
      ]);
    return vehicles + activities + boardRequests + minutes + memberships + violations + proceedings;
  }

  private async deleteStoredImages(ids: Array<string | null>) {
    const unique = [...new Set(ids.filter((item): item is string => Boolean(item)))];
    for (const imageId of unique) {
      try {
        await this.prisma.storedImage.delete({ where: { id: imageId } });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          (error.code === 'P2003' || error.code === 'P2025')
        ) {
          continue;
        }
        throw error;
      }
    }
  }

  async documentTypes() {
    const rows = await this.prisma.caseIdentityDocument.findMany({
      orderBy: { document: { title: 'asc' } },
      select: {
        gender: true,
        document: {
          select: {
            id: true,
            code: true,
            title: true,
            isRequired: true,
            isFixed: true,
          },
        },
      },
    });
    return rows.map((row) => ({ ...row.document, gender: row.gender }));
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

  private async currentRequest(caseId: string) {
    const open = await findOpenRequest(this.prisma, caseId);
    if (open) return open;
    return this.prisma.caseRequest.findFirst({
      where: { caseFileId: caseId, type: CaseRequestType.ISSUANCE },
      orderBy: { createdAt: 'desc' },
    });
  }

  async activityRequirements(caseId: string, jobId?: string) {
    const file = await this.prisma.caseFile.findUnique({
      where: { id: caseId },
      select: { id: true, activityJobId: true, user: { select: { gender: true } } },
    });
    if (!file) throw new NotFoundException('پرونده یافت نشد');
    const request = await this.currentRequest(caseId);
    const type = request && isProcessType(request.type) ? request.type : CaseRequestType.ISSUANCE;
    return resolveDocumentRequirements(
      this.prisma,
      type,
      jobId || file.activityJobId,
      file.user.gender,
    );
  }

  async activityDocuments(caseId: string) {
    const file = await this.prisma.caseFile.findUnique({
      where: { id: caseId },
      select: { id: true },
    });
    if (!file) throw new NotFoundException('پرونده یافت نشد');
    const request = await this.currentRequest(caseId);
    if (!request) return [];
    const rows = await this.prisma.caseActivityDocument.findMany({
      where: { caseRequestId: request.id },
      select: {
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
    caseId?: string;
    jobId?: string;
    buffer: Buffer;
    mimeType: string;
    originalName: string;
  }) {
    await this.assertPerson(input.userId);
    const document = await this.prisma.document.findUnique({
      where: { id: input.documentId },
      select: { id: true, isFixed: true, isRequired: true },
    });
    if (!document) throw new NotFoundException('مدرک یافت نشد');
    if (input.caseId) {
      return this.uploadActivityDocument(input, document);
    }
    if (input.jobId) {
      throw new BadRequestException('مدرک شغلی باید روی پرونده ذخیره شود');
    }
    const linked = await this.prisma.caseIdentityDocument.findUnique({
      where: { documentId: document.id },
      select: { documentId: true },
    });
    if (!linked) throw new NotFoundException('این مدرک در فهرست مدارک اطلاعات هویتی نیست');

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

  private async uploadActivityDocument(
    input: {
      userId: string;
      documentId: string;
      caseId?: string;
      jobId?: string;
      buffer: Buffer;
      mimeType: string;
      originalName: string;
    },
    document: { id: string; isFixed: boolean; isRequired: boolean },
  ) {
    if (!input.caseId) throw new BadRequestException('مدرک شغلی باید روی پرونده ذخیره شود');
    const caseFile = await this.prisma.caseFile.findUnique({
      where: { id: input.caseId },
      select: { id: true, userId: true, activityJobId: true, user: { select: { gender: true } } },
    });
    if (!caseFile || caseFile.userId !== input.userId) {
      throw new NotFoundException('پرونده یافت نشد');
    }
    const jobId = input.jobId || caseFile.activityJobId;
    if (!jobId) throw new BadRequestException('قبل از بارگذاری مدرک باید شغل انتخاب شود');
    const request = await this.currentRequest(caseFile.id);
    if (!request || !isProcessType(request.type)) {
      throw new BadRequestException('درخواست بازی برای این مدرک نیست');
    }
    const allowed = await this.isActivityDocument(document, jobId, request.type, caseFile.user.gender);
    if (!allowed) throw new NotFoundException('این مدرک برای شغل انتخاب‌شده نیست');
    const activityDocument = await this.prisma.caseActivityDocument.upsert({
      where: {
        caseRequestId_documentId: { caseRequestId: request.id, documentId: document.id },
      },
      create: { caseFileId: caseFile.id, caseRequestId: request.id, documentId: document.id },
      update: {},
      select: {
        id: true,
        versions: { select: { version: true }, orderBy: { version: 'desc' }, take: 1 },
      },
    });
    const version = (activityDocument.versions[0]?.version ?? 0) + 1;
    const stored = await this.files.saveCaseActivity({
      personId: caseFile.userId,
      caseFileId: caseFile.id,
      documentId: document.id,
      version,
      buffer: input.buffer,
      mimeType: input.mimeType,
      originalName: input.originalName,
    });
    const created = await this.prisma.caseActivityDocumentVersion.create({
      data: {
        caseActivityDocumentId: activityDocument.id,
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

  async removeDocument(userId: string, documentId: string) {
    await this.assertPerson(userId);
    const row = await this.prisma.personDocument.findUnique({
      where: { userId_documentId: { userId, documentId } },
      select: {
        id: true,
        versions: { select: { storageKey: true } },
      },
    });
    if (!row || row.versions.length === 0) {
      throw new NotFoundException('مدرک بارگذاری‌شده‌ای یافت نشد');
    }
    await this.prisma.personDocument.delete({ where: { id: row.id } });
    await this.removeStorageIfUnused(row.versions.map((version) => version.storageKey));
    return { ok: true };
  }

  async removeActivityDocument(caseId: string, documentId: string) {
    const file = await this.prisma.caseFile.findUnique({
      where: { id: caseId },
      select: { id: true },
    });
    if (!file) throw new NotFoundException('پرونده یافت نشد');
    const request = await this.currentRequest(caseId);
    if (!request) throw new NotFoundException('مدرک بارگذاری‌شده‌ای یافت نشد');
    const row = await this.prisma.caseActivityDocument.findUnique({
      where: { caseRequestId_documentId: { caseRequestId: request.id, documentId } },
      select: {
        id: true,
        versions: { select: { storageKey: true } },
      },
    });
    if (!row || row.versions.length === 0) {
      throw new NotFoundException('مدرک بارگذاری‌شده‌ای یافت نشد');
    }
    await this.prisma.caseActivityDocument.delete({ where: { id: row.id } });
    await this.removeStorageIfUnused(row.versions.map((version) => version.storageKey));
    return { ok: true };
  }

  async readDocumentFile(versionId: string) {
    const version = await this.prisma.personDocumentVersion.findUnique({
      where: { id: versionId },
    });
    if (version) {
      const data = await this.files.read(version.storageKey);
      return { ...version, data };
    }
    const activity = await this.prisma.caseActivityDocumentVersion.findUnique({
      where: { id: versionId },
    });
    if (!activity) throw new NotFoundException('فایل مدرک یافت نشد');
    const data = await this.files.read(activity.storageKey);
    return { ...activity, data };
  }

  private matchesDocumentGender(
    gender: DocumentGender,
    personGender: 'MALE' | 'FEMALE' | null,
  ) {
    return gender === DocumentGender.BOTH || !personGender || gender === personGender;
  }

  private async isActivityDocument(
    document: { id: string },
    jobId: string,
    requestType: CaseRequestType,
    gender: 'MALE' | 'FEMALE' | null,
  ) {
    const rows = await resolveDocumentRequirements(this.prisma, requestType, jobId, gender);
    return rows.some((row) => row.id === document.id);
  }

  private async assertActivityDocumentsDelivered(caseFileId: string) {
    const file = await this.prisma.caseFile.findUnique({
      where: { id: caseFileId },
      select: { activityJobId: true, user: { select: { gender: true } } },
    });
    if (!file?.activityJobId) {
      throw new BadRequestException('قبل از مرحله اماکن باید شغل و مدارک آن تکمیل شود');
    }
    const request = await this.currentRequest(caseFileId);
    if (!request || !isProcessType(request.type)) {
      throw new BadRequestException('قبل از مرحله اماکن باید شغل و مدارک آن تکمیل شود');
    }
    const required = await resolveDocumentRequirements(
      this.prisma,
      request.type,
      file.activityJobId,
      file.user.gender,
    );
    const stored = await this.prisma.caseActivityDocument.findMany({
      where: { caseRequestId: request.id },
      select: {
        documentId: true,
        versions: { select: { id: true }, take: 1 },
      },
    });
    const uploaded = new Set(
      stored.filter((row) => row.versions.length > 0).map((row) => row.documentId),
    );
    for (const item of required) {
      if (!item.isRequired) continue;
      if (!uploaded.has(item.id)) {
        throw new BadRequestException(
          'قبل از مرحله اماکن همه مدارک الزامی این شغل باید بارگذاری شده باشند',
        );
      }
    }
  }

  private async removeStorageIfUnused(keys: string[]) {
    for (const storageKey of [...new Set(keys)]) {
      const [personUse, caseUse] = await Promise.all([
        this.prisma.personDocumentVersion.count({ where: { storageKey } }),
        this.prisma.caseActivityDocumentVersion.count({ where: { storageKey } }),
      ]);
      if (personUse + caseUse === 0) await this.files.remove(storageKey);
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
