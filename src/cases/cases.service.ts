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
import { normalizeNationalId, toLatinDigits } from '../common/national-id';
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
  CaseFileKind,
  CaseFileStatus,
  CaseInquiryStatus,
  CaseRequestStatus,
  CaseRequestType,
  CaseSuspensionFileKind,
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
import { CaseKindFilter, FindCasesQueryDto } from './dto/find-cases-query.dto';
import { LiftCaseSuspensionDto } from './dto/lift-case-suspension.dto';
import { RevokeCaseDto } from './dto/revoke-case.dto';
import { SuspendCaseDto } from './dto/suspend-case.dto';
import { SaveCaseActivityDto } from './dto/save-case-activity.dto';
import { SaveCaseLocationDto } from './dto/save-case-location.dto';
import { SaveCaseIdentityDto } from './dto/save-case-identity.dto';
import { SaveFormationStepDto } from './dto/save-formation-step.dto';
import { FindIssuanceQueryDto } from './dto/find-issuance-query.dto';
import { CaseStewardshipService } from './case-stewardship.service';
import { CaseAuctionService } from './case-auction.service';
import { PersonFileStorage } from './person-file.storage';
import { CaseInquiriesService } from './case-inquiries.service';
import { CasePlacesService } from './case-places.service';
import { CaseGeneralSettingsService } from './case-general-settings.service';
import { PERSONNEL_PHOTO_CODE } from './personnel-photo';
import { unpaidDebtForCase } from '../case-finance/request-fee-status';
import { CaseManagementApproversService } from './case-management-approvers.service';
import {
  INQUIRIES_FORMATION_STEP,
  ISSUANCE_FORMATION_STEP,
  MANAGEMENT_FORMATION_STEP,
  PLACES_FORMATION_STEP,
  STEWARDSHIP_INQUIRY_STEP,
  STEWARDSHIP_PLACES_STEP,
  syncIssuanceRequest,
} from './formation-steps';
import { readContractYears } from './contract-duration';
import {
  alignDefaultRenewalExpiry,
  assertRequestMutable,
  completeOpenRequest,
  findOpenRequest,
  issuanceReachedWhere,
  isProcessType,
  processManagementTitles,
  requestIsDone,
  requestIsOpen,
  requestOnCase,
  openProcessRequest,
  resolveDocumentRequirements,
} from './request-process';
import {
  syncCaseStatus,
  suspensionIsActive as suspensionActiveOn,
} from './case-status';
import { todayIsoDateTehran } from '../common/iso-date';

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
  kind: true,
  formationStep: true,
  trackingCode: true,
  licenseIssuedAt: true,
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
  requests: {
    where: { type: 'ISSUANCE' as const },
    orderBy: [{ createdAt: 'desc' as const }, { id: 'desc' as const }],
    take: 1,
    select: { intakeSubmittedAt: true, status: true },
  },
} satisfies Prisma.CaseFileSelect;

type PersonRow = Prisma.UserGetPayload<{ select: typeof personSelect }>;
type CaseFileRow = Prisma.CaseFileGetPayload<{ select: typeof caseFileSelect }>;

function decimalText(value: Prisma.Decimal | null) {
  return value == null ? null : value.toString();
}

function mapLocation(user: {
  premiseCityId: string | null;
  premiseEstablishment: PremiseEstablishment | null;
  premiseComplexId: string | null;
  premiseAddress: string | null;
  premiseAddressEn: string | null;
  premisePlaque: string | null;
  premisePlaqueSeries: string | null;
  premiseFloor: string | null;
  premiseUnitNo: string | null;
  premisePostalCode: string | null;
  premisePhone: string | null;
  premiseFax: string | null;
  premiseGeoPosition: PremiseGeoPosition | null;
  premisePublicAccess: PremisePublicAccess | null;
  registrationPlaceId: string | null;
  premiseOwnership: PremiseOwnership | null;
  premiseDeedNo: string | null;
  premiseArea: Prisma.Decimal | null;
  leaseIssuedAt: Date | null;
  leaseExpiresAt: Date | null;
  leaseAgency: string | null;
  premiseOwnerName: string | null;
}) {
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

function mapActivity(
  user: Pick<
    CaseFileRow,
    | 'businessUnitTitle'
    | 'previousOccupation'
    | 'posDeviceCount'
    | 'activityJob'
  >,
) {
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

function mapRequestDocuments(
  requirements: { id: string; title: string; isRequired: boolean }[],
  activityDocuments: {
    documentId: string;
    document: { title: string };
    versions: {
      id: string;
      originalName: string | null;
      mimeType: string;
      createdAt: Date;
    }[];
  }[],
) {
  const uploaded = new Map(
    activityDocuments.map((row) => [row.documentId, row]),
  );
  const seen = new Set<string>();
  const documents: {
    id: string;
    title: string;
    isRequired: boolean;
    file: {
      id: string;
      originalName: string | null;
      mimeType: string;
      createdAt: string;
    } | null;
  }[] = [];
  const mapFile = (file: {
    id: string;
    originalName: string | null;
    mimeType: string;
    createdAt: Date;
  }) => ({
    id: file.id,
    originalName: file.originalName,
    mimeType: file.mimeType,
    createdAt: file.createdAt.toISOString(),
  });
  for (const requirement of requirements) {
    seen.add(requirement.id);
    const row = uploaded.get(requirement.id);
    const file = row?.versions[0] ?? null;
    documents.push({
      id: requirement.id,
      title: requirement.title,
      isRequired: requirement.isRequired,
      file: file ? mapFile(file) : null,
    });
  }
  for (const row of activityDocuments) {
    if (seen.has(row.documentId)) continue;
    const file = row.versions[0];
    if (!file) continue;
    documents.push({
      id: row.documentId,
      title: row.document.title,
      isRequired: false,
      file: mapFile(file),
    });
  }
  documents.sort((left, right) => left.title.localeCompare(right.title, 'fa'));
  return documents;
}

function localTodayIso() {
  return todayIsoDateTehran();
}

function suspensionIsActive(
  row: { startsAt: Date; endsAt: Date | null; liftedAt?: Date | null },
  today: Date,
) {
  return suspensionActiveOn(row, today);
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

function pendingIntakeIso(
  requests: {
    type: CaseRequestType;
    status: CaseRequestStatus;
    formationStep: number;
    intakeSubmittedAt: Date | null;
  }[],
  fileFormationStep: number,
) {
  const open = requests.find(
    (request) =>
      request.status === CaseRequestStatus.OPEN && request.intakeSubmittedAt,
  );
  if (!open?.intakeSubmittedAt) return null;
  if (
    open.type === CaseRequestType.ISSUANCE &&
    fileFormationStep >= INQUIRIES_FORMATION_STEP
  ) {
    return null;
  }
  if (
    (open.type === CaseRequestType.RENEWAL ||
      open.type === CaseRequestType.LOCATION_CHANGE) &&
    open.formationStep >= 2
  ) {
    return null;
  }
  if (open.type === CaseRequestType.AUCTION && open.formationStep >= 1) {
    return null;
  }
  return open.intakeSubmittedAt.toISOString();
}

function mapCase(file: CaseFileRow) {
  const intake = file.requests.find(
    (request) => request.status === 'OPEN' && request.intakeSubmittedAt,
  );
  return {
    id: file.id,
    formationStep: file.formationStep,
    trackingCode: file.trackingCode,
    licenseIssuedAt: dateOnly(file.licenseIssuedAt),
    intakeSubmittedAt: intake?.intakeSubmittedAt?.toISOString() ?? null,
    activity: mapActivity(file),
    location: mapLocation(file),
  };
}

function resolveListCaseKind(
  kind: CaseFileKind,
  requests: { type: CaseRequestType; status: CaseRequestStatus }[],
): CaseKindFilter {
  const current =
    requests.find((item) => item.status === CaseRequestStatus.OPEN) ??
    requests[0];
  if (
    kind === CaseFileKind.STEWARDSHIP ||
    current?.type === CaseRequestType.STEWARDSHIP
  ) {
    if (
      current &&
      (current.status === CaseRequestStatus.ISSUED ||
        current.status === CaseRequestStatus.COMPLETED)
    ) {
      return 'STEWARD_CARD';
    }
    return 'STEWARD_REQUEST';
  }
  if (current?.type === CaseRequestType.RENEWAL) return 'RENEWAL';
  if (current?.type === CaseRequestType.LOCATION_CHANGE)
    return 'LOCATION_CHANGE';
  if (current?.type === CaseRequestType.AUCTION) return 'AUCTION';
  return 'ISSUANCE';
}

function caseKindWhere(caseKind?: CaseKindFilter): Prisma.CaseFileWhereInput {
  if (caseKind === 'STEWARD_REQUEST') {
    return {
      kind: CaseFileKind.LICENSE,
      stewardCases: { some: {} },
    };
  }
  if (caseKind === 'STEWARD_CARD') {
    return {
      requests: {
        some: {
          type: CaseRequestType.STEWARDSHIP,
          status: {
            in: [CaseRequestStatus.ISSUED, CaseRequestStatus.COMPLETED],
          },
        },
      },
    };
  }
  if (
    caseKind === 'ISSUANCE' ||
    caseKind === 'RENEWAL' ||
    caseKind === 'LOCATION_CHANGE' ||
    caseKind === 'AUCTION'
  ) {
    return { requests: { some: { type: caseKind } } };
  }
  return {};
}

function compareNullableTime(left: Date | null, right: Date | null) {
  if (left == null && right == null) return 0;
  if (left == null) return 1;
  if (right == null) return -1;
  return left.getTime() - right.getTime();
}

function compareNullableText(left: string | null, right: string | null) {
  if (!left && !right) return 0;
  if (!left) return 1;
  if (!right) return -1;
  return left.localeCompare(right, 'fa');
}

/** مقدارهای خالی در هر دو جهت آخر می‌مانند. */
function directedCompare(
  compared: number,
  asc: boolean,
  leftMissing: boolean,
  rightMissing: boolean,
) {
  if (leftMissing || rightMissing || compared === 0) return compared;
  return asc ? compared : -compared;
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
    private readonly stewardship: CaseStewardshipService,
    private readonly auction: CaseAuctionService,
  ) {}

  private async ensureTrackingCode(
    caseFileId: string,
    current: string | null,
    formationStep: number,
  ) {
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
        if (
          !(error instanceof Prisma.PrismaClientKnownRequestError) ||
          error.code !== 'P2002'
        ) {
          throw error;
        }
      }
    }
    throw new ConflictException('صدور کد رهگیری انجام نشد');
  }

  private async attachTrackingCode(file: {
    id: string;
    formationStep: number;
    trackingCode: string | null;
  }) {
    const trackingCode = await this.ensureTrackingCode(
      file.id,
      file.trackingCode,
      file.formationStep,
    );
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
    const open =
      files.find(
        (file) =>
          file.kind === CaseFileKind.LICENSE &&
          file.formationStep < ISSUANCE_FORMATION_STEP,
      ) ?? null;
    const requested = caseId
      ? (files.find((file) => file.id === caseId) ?? null)
      : null;
    return {
      found: true as const,
      person: mapIdentity(user),
      openCase: open ? mapCase(open) : null,
      requestedCase: requested ? mapCase(requested) : null,
      hasIssuedCase: files.some(
        (file) =>
          file.kind === CaseFileKind.LICENSE &&
          file.formationStep >= ISSUANCE_FORMATION_STEP,
      ),
    };
  }

  async saveIdentity(dto: SaveCaseIdentityDto, actorId: string) {
    if (dto.caseId) await this.assertCaseEditable(dto.caseId, actorId);
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
      religionOther:
        dto.religion === 'OTHER' ? dto.religionOther?.trim() || null : null,
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
    const file = await this.resolveCaseFile(
      user.id,
      dto.caseId,
      dto.startNew === true,
    );
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
      throw new ConflictException(
        'این کد ملی قبلاً به‌عنوان نام کاربری ثبت شده است',
      );
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

  private async resolveCaseFile(
    userId: string,
    caseId: string | null | undefined,
    startNew: boolean,
  ) {
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
        where: {
          userId,
          kind: CaseFileKind.LICENSE,
          formationStep: { lt: ISSUANCE_FORMATION_STEP },
        },
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

  private async bumpIdentityStep(row: {
    id: string;
    formationStep: number;
    trackingCode: string | null;
  }) {
    const kind = await this.prisma.caseFile.findUnique({
      where: { id: row.id },
      select: { kind: true },
    });
    if (kind?.kind === CaseFileKind.STEWARDSHIP) return row;
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

  /**
   * مدارک هویتی بین همهٔ پرونده‌های شخص مشترک‌اند.
   * اگر مجوزی صادر شده باشد، همان قفل ویرایش پروندهٔ صادرشده اعمال می‌شود.
   */
  private async assertPersonIdentityEditable(userId: string, actorId?: string) {
    const issued = await this.prisma.caseFile.findFirst({
      where: { userId, licenseNumber: { not: null } },
      select: { licenseNumber: true },
    });
    if (!issued?.licenseNumber) return;
    if (!actorId) throw new UnauthorizedException();
    await this.assertIssuedCaseEditable(issued.licenseNumber, actorId);
  }

  /** پروندهٔ صادرشده فقط وقتی تنظیم ویرایش روشن است و کاربر نقش انتخاب‌شده را دارد قابل تغییر است. */
  private async assertCaseEditable(caseId: string, actorId: string) {
    const file = await this.prisma.caseFile.findUnique({
      where: { id: caseId },
      select: { licenseNumber: true },
    });
    if (!file) throw new NotFoundException('پرونده یافت نشد');
    await this.assertIssuedCaseEditable(file.licenseNumber, actorId);
  }

  /** پروندهٔ صادرشده فقط برای نقش انتخاب‌شده در تنظیمات کلی قابل ویرایش است. شماره مجوز ثابت می‌ماند. */
  private async assertIssuedCaseEditable(
    licenseNumber: string | null,
    userId: string,
  ) {
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
        previousOccupation: (dto.previousOccupation ??
          null) as PreviousOccupation | null,
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
      dto.establishment === 'COMMERCIAL_COMPLEX'
        ? (dto.complexId ?? null)
        : null;
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
    const intake = await this.prisma.caseRequest.findFirst({
      where: { caseFileId: user.id, type: 'ISSUANCE', status: 'OPEN' },
      select: { intakeSubmittedAt: true },
    });
    const holdForIntake =
      Boolean(intake?.intakeSubmittedAt) &&
      user.formationStep < INQUIRIES_FORMATION_STEP;
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
        premiseGeoPosition: (dto.geoPosition ??
          null) as PremiseGeoPosition | null,
        premisePublicAccess: (dto.publicAccess ??
          null) as PremisePublicAccess | null,
        registrationPlaceId: dto.registrationPlaceId ?? null,
        premiseOwnership: dto.ownership as PremiseOwnership,
        premiseDeedNo: dto.deedNo?.trim() || null,
        premiseArea: dto.area ?? null,
        leaseIssuedAt: rented ? parseDate(dto.leaseIssuedAt) : null,
        leaseExpiresAt: rented ? parseDate(dto.leaseExpiresAt) : null,
        leaseAgency: rented ? dto.leaseAgency?.trim() || null : null,
        premiseOwnerName: rented ? dto.ownerName?.trim() || null : null,
        formationStep: holdForIntake
          ? Math.max(user.formationStep, 2)
          : Math.max(user.formationStep, 3),
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

  async removeRequest(
    caseId: string,
    requestId: string,
    actor?: { id: string; isAdmin?: boolean },
  ) {
    if (!actor?.id) throw new UnauthorizedException();
    const request = await this.prisma.caseRequest.findFirst({
      where: { id: requestId, caseFileId: caseId },
      select: { id: true, status: true, type: true },
    });
    if (!request) throw new NotFoundException('درخواست یافت نشد');
    if (request.type === CaseRequestType.ISSUANCE) {
      throw new ForbiddenException('حذف صدور مجوز ممکن نیست');
    }
    if (requestIsDone(request.status) && !actor.isAdmin) {
      throw new ForbiddenException(
        'پس از اتمام درخواست فقط مدیریت می‌تواند آن را حذف کند',
      );
    }
    await this.prisma.caseRequest.delete({ where: { id: request.id } });
    return { id: request.id };
  }

  async processState(caseId: string, requestId?: string, actorId?: string) {
    const request = requestId
      ? await this.prisma.caseRequest.findFirst({
          where: { id: requestId, caseFileId: caseId },
        })
      : await findOpenRequest(this.prisma, caseId);
    if (
      !request ||
      !isProcessType(request.type) ||
      request.type === CaseRequestType.ISSUANCE
    ) {
      throw new NotFoundException(
        requestId ? 'درخواست یافت نشد' : 'درخواست باز یافت نشد',
      );
    }
    const [storedTerms, draft, file] = await Promise.all([
      request.type === CaseRequestType.RENEWAL
        ? this.prisma.caseRenewalTerms.findUnique({
            where: { requestId: request.id },
          })
        : Promise.resolve(null),
      request.type === CaseRequestType.LOCATION_CHANGE
        ? this.prisma.caseLocationDraft.findUnique({
            where: { requestId: request.id },
          })
        : Promise.resolve(null),
      this.prisma.caseFile.findUnique({
        where: { id: caseId },
        select: {
          id: true,
          licenseNumber: true,
          licenseIssuedAt: true,
          trackingCode: true,
          userId: true,
          businessUnitTitle: true,
          user: {
            select: {
              firstName: true,
              lastName: true,
              fullName: true,
              nationalId: true,
              phone: true,
            },
          },
          activityJob: {
            select: { title: true, group: { select: { title: true } } },
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
          premiseCity: { select: { nameFa: true, nameEn: true } },
          premiseComplex: { select: { name: true, nameEn: true } },
        },
      }),
    ]);
    const contractYears = await readContractYears(this.prisma);
    const terms =
      request.type === CaseRequestType.RENEWAL &&
      storedTerms &&
      request.status === CaseRequestStatus.OPEN
        ? await alignDefaultRenewalExpiry(
            this.prisma,
            storedTerms,
            contractYears,
          )
        : storedTerms;
    const canEdit =
      request.status === CaseRequestStatus.OPEN
        ? true
        : requestIsDone(request.status) && actorId
          ? (await this.generalSettings.userMayEditIssuedCase(actorId)) === true
          : false;
    const date = (value: Date | null | undefined) =>
      value ? value.toISOString().slice(0, 10) : null;
    return {
      id: request.id,
      caseId,
      userId: file?.userId ?? null,
      number: request.number,
      type: request.type,
      status: request.status,
      canEdit,
      formationStep: request.formationStep,
      intakeSubmittedAt: request.intakeSubmittedAt?.toISOString() ?? null,
      licenseNumber: file?.licenseNumber ?? null,
      licenseIssuedAt: date(file?.licenseIssuedAt),
      trackingCode: file?.trackingCode ?? null,
      nationalId: file?.user.nationalId ?? null,
      phone: file?.user.phone ?? null,
      businessUnitTitle: file?.businessUnitTitle ?? null,
      person: file?.user
        ? {
            firstName: file.user.firstName,
            lastName: file.user.lastName,
            fullName: file.user.fullName,
          }
        : null,
      jobGroupTitle: file?.activityJob?.group?.title ?? null,
      jobTitle: file?.activityJob?.title ?? null,
      contractYears,
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
      currentLocation: file
        ? {
            ...mapLocation(file),
            city: file.premiseCity,
            complex: file.premiseComplex
              ? {
                  name: file.premiseComplex.name,
                  nameEn: file.premiseComplex.nameEn,
                }
              : null,
          }
        : null,
    };
  }

  private async requestManagement(
    requestType: CaseRequestType,
    rows: {
      id: string;
      status: CaseInquiryStatus;
      note: string | null;
      decidedAt: Date | null;
      decidedBy: { fullName: string } | null;
      workUnit: { title: string } | null;
      role: { id: string; name: string };
    }[],
  ) {
    const titles = await processManagementTitles(this.prisma, requestType);
    if (!titles.length) return [];
    const titleByRole = new Map(
      titles.map((item) => [item.roleId, item.title]),
    );
    return rows
      .filter((row) => titleByRole.has(row.role.id))
      .map((row) => ({
        id: row.id,
        workUnitTitle: row.workUnit?.title ?? null,
        roleName: row.role.name,
        displayTitle: titleByRole.get(row.role.id) ?? null,
        status: row.status,
        note: row.note,
        decidedAt: row.decidedAt?.toISOString() ?? null,
        decidedByName: row.decidedBy?.fullName ?? null,
      }));
  }

  async renewalView(caseId: string, requestId: string) {
    const request = await this.prisma.caseRequest.findFirst({
      where: {
        id: requestId,
        caseFileId: caseId,
        type: CaseRequestType.RENEWAL,
      },
      select: {
        id: true,
        number: true,
        status: true,
        formationStep: true,
        createdAt: true,
        completedAt: true,
        renewalTerms: true,
        caseFile: {
          select: {
            licenseNumber: true,
            licenseIssuedAt: true,
            trackingCode: true,
            businessUnitTitle: true,
            activityJobId: true,
            user: {
              select: {
                gender: true,
                firstName: true,
                lastName: true,
                fullName: true,
                nationalId: true,
              },
            },
            activityJob: {
              select: { title: true, group: { select: { title: true } } },
            },
          },
        },
        activityDocuments: {
          select: {
            documentId: true,
            document: { select: { title: true } },
            versions: {
              orderBy: { version: 'desc' },
              take: 1,
              select: {
                id: true,
                originalName: true,
                mimeType: true,
                createdAt: true,
              },
            },
          },
        },
        inquiries: {
          orderBy: [{ inquiryCenter: { name: 'asc' } }, { id: 'asc' }],
          select: {
            id: true,
            status: true,
            note: true,
            referredAt: true,
            decidedAt: true,
            decidedBy: { select: { fullName: true } },
            inquiryCenter: { select: { name: true } },
          },
        },
        placesReview: {
          select: {
            id: true,
            status: true,
            note: true,
            referredAt: true,
            decidedAt: true,
            decidedBy: { select: { fullName: true } },
          },
        },
        managementReviews: {
          orderBy: [
            { workUnit: { title: 'asc' } },
            { role: { name: 'asc' } },
            { id: 'asc' },
          ],
          select: {
            id: true,
            status: true,
            note: true,
            decidedAt: true,
            decidedBy: { select: { fullName: true } },
            workUnit: { select: { title: true } },
            role: { select: { id: true, name: true } },
          },
        },
      },
    });
    if (!request) throw new NotFoundException('درخواست تمدید یافت نشد');
    const requirements = await resolveDocumentRequirements(
      this.prisma,
      CaseRequestType.RENEWAL,
      request.caseFile.activityJobId,
      request.caseFile.user.gender,
    );
    const documents = mapRequestDocuments(
      requirements,
      request.activityDocuments,
    );
    const terms = request.renewalTerms;
    const stamp = (value: Date | null | undefined) =>
      value?.toISOString() ?? null;
    return {
      id: request.id,
      number: request.number,
      status: request.status,
      formationStep: request.formationStep,
      createdAt: request.createdAt.toISOString(),
      completedAt: stamp(request.completedAt),
      licenseNumber: request.caseFile.licenseNumber,
      licenseIssuedAt: dateOnly(request.caseFile.licenseIssuedAt),
      trackingCode: request.caseFile.trackingCode,
      applicantName:
        request.caseFile.user.fullName?.trim() ||
        [request.caseFile.user.firstName, request.caseFile.user.lastName]
          .filter(Boolean)
          .join(' '),
      nationalId: request.caseFile.user.nationalId,
      businessUnitTitle: request.caseFile.businessUnitTitle,
      jobGroupTitle: request.caseFile.activityJob?.group?.title ?? null,
      jobTitle: request.caseFile.activityJob?.title ?? null,
      renewal: terms
        ? {
            currentIssuedAt: dateOnly(terms.currentIssuedAt),
            currentExpiresAt: dateOnly(terms.currentExpiresAt),
            nextIssuedAt: dateOnly(terms.nextIssuedAt),
            nextExpiresAt: dateOnly(terms.nextExpiresAt),
            delayDays: terms.delayDays,
          }
        : null,
      documents,
      inquiries: request.inquiries.map((row) => ({
        id: row.id,
        centerName: row.inquiryCenter.name,
        status: row.status,
        note: row.note,
        referredAt: stamp(row.referredAt),
        decidedAt: stamp(row.decidedAt),
        decidedByName: row.decidedBy?.fullName ?? null,
      })),
      places: request.placesReview
        ? {
            id: request.placesReview.id,
            status: request.placesReview.status,
            note: request.placesReview.note,
            referredAt: stamp(request.placesReview.referredAt),
            decidedAt: stamp(request.placesReview.decidedAt),
            decidedByName: request.placesReview.decidedBy?.fullName ?? null,
          }
        : null,
      management: await this.requestManagement(
        CaseRequestType.RENEWAL,
        request.managementReviews,
      ),
    };
  }

  async locationView(caseId: string, requestId: string) {
    const placeSelect = {
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
      premiseCity: { select: { nameFa: true, nameEn: true } },
      premiseComplex: { select: { name: true, nameEn: true } },
    } as const;
    const request = await this.prisma.caseRequest.findFirst({
      where: {
        id: requestId,
        caseFileId: caseId,
        type: CaseRequestType.LOCATION_CHANGE,
      },
      select: {
        id: true,
        number: true,
        status: true,
        formationStep: true,
        createdAt: true,
        completedAt: true,
        locationDraft: { select: placeSelect },
        replacedPremise: { select: placeSelect },
        caseFile: {
          select: {
            licenseNumber: true,
            licenseIssuedAt: true,
            trackingCode: true,
            businessUnitTitle: true,
            activityJobId: true,
            user: {
              select: {
                gender: true,
                firstName: true,
                lastName: true,
                fullName: true,
                nationalId: true,
              },
            },
            activityJob: {
              select: { title: true, group: { select: { title: true } } },
            },
          },
        },
        activityDocuments: {
          select: {
            documentId: true,
            document: { select: { title: true } },
            versions: {
              orderBy: { version: 'desc' },
              take: 1,
              select: {
                id: true,
                originalName: true,
                mimeType: true,
                createdAt: true,
              },
            },
          },
        },
        inquiries: {
          orderBy: [{ inquiryCenter: { name: 'asc' } }, { id: 'asc' }],
          select: {
            id: true,
            status: true,
            note: true,
            referredAt: true,
            decidedAt: true,
            decidedBy: { select: { fullName: true } },
            inquiryCenter: { select: { name: true } },
          },
        },
        placesReview: {
          select: {
            id: true,
            status: true,
            note: true,
            referredAt: true,
            decidedAt: true,
            decidedBy: { select: { fullName: true } },
          },
        },
        managementReviews: {
          orderBy: [
            { workUnit: { title: 'asc' } },
            { role: { name: 'asc' } },
            { id: 'asc' },
          ],
          select: {
            id: true,
            status: true,
            note: true,
            decidedAt: true,
            decidedBy: { select: { fullName: true } },
            workUnit: { select: { title: true } },
            role: { select: { id: true, name: true } },
          },
        },
      },
    });
    if (!request) throw new NotFoundException('درخواست تغییر مکان یافت نشد');
    const requirements = await resolveDocumentRequirements(
      this.prisma,
      CaseRequestType.LOCATION_CHANGE,
      request.caseFile.activityJobId,
      request.caseFile.user.gender,
    );
    const stamp = (value: Date | null | undefined) =>
      value?.toISOString() ?? null;
    const place = (
      row: typeof request.locationDraft | typeof request.replacedPremise,
    ) => {
      if (!row) return null;
      return {
        ...mapLocation(row),
        city: row.premiseCity,
        complex: row.premiseComplex
          ? { name: row.premiseComplex.name, nameEn: row.premiseComplex.nameEn }
          : null,
      };
    };
    return {
      id: request.id,
      number: request.number,
      status: request.status,
      formationStep: request.formationStep,
      createdAt: request.createdAt.toISOString(),
      completedAt: stamp(request.completedAt),
      licenseNumber: request.caseFile.licenseNumber,
      licenseIssuedAt: dateOnly(request.caseFile.licenseIssuedAt),
      trackingCode: request.caseFile.trackingCode,
      applicantName:
        request.caseFile.user.fullName?.trim() ||
        [request.caseFile.user.firstName, request.caseFile.user.lastName]
          .filter(Boolean)
          .join(' '),
      nationalId: request.caseFile.user.nationalId,
      businessUnitTitle: request.caseFile.businessUnitTitle,
      jobGroupTitle: request.caseFile.activityJob?.group?.title ?? null,
      jobTitle: request.caseFile.activityJob?.title ?? null,
      location: place(request.locationDraft),
      previousLocation: place(request.replacedPremise),
      documents: mapRequestDocuments(requirements, request.activityDocuments),
      inquiries: request.inquiries.map((row) => ({
        id: row.id,
        centerName: row.inquiryCenter.name,
        status: row.status,
        note: row.note,
        referredAt: stamp(row.referredAt),
        decidedAt: stamp(row.decidedAt),
        decidedByName: row.decidedBy?.fullName ?? null,
      })),
      places: request.placesReview
        ? {
            id: request.placesReview.id,
            status: request.placesReview.status,
            note: request.placesReview.note,
            referredAt: stamp(request.placesReview.referredAt),
            decidedAt: stamp(request.placesReview.decidedAt),
            decidedByName: request.placesReview.decidedBy?.fullName ?? null,
          }
        : null,
      management: await this.requestManagement(
        CaseRequestType.LOCATION_CHANGE,
        request.managementReviews,
      ),
    };
  }

  async saveLocationDraft(dto: SaveCaseLocationDto, actorId?: string) {
    const request = dto.requestId
      ? await this.prisma.caseRequest.findFirst({
          where: { id: dto.requestId, caseFileId: dto.caseId },
        })
      : await findOpenRequest(this.prisma, dto.caseId);
    if (!request || request.type !== CaseRequestType.LOCATION_CHANGE) {
      throw new BadRequestException(
        dto.requestId
          ? 'درخواست تغییر مکان یافت نشد'
          : 'درخواست تغییر مکان باز نیست',
      );
    }
    await assertRequestMutable(this.prisma, request.id, actorId);
    const city = await this.prisma.city.findUnique({
      where: { id: dto.cityId },
      select: { id: true },
    });
    if (!city) throw new BadRequestException('شهر معتبر نیست');
    const complex =
      dto.establishment === 'COMMERCIAL_COMPLEX'
        ? (dto.complexId ?? null)
        : null;
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
        premiseGeoPosition: (dto.geoPosition ??
          null) as PremiseGeoPosition | null,
        premisePublicAccess: (dto.publicAccess ??
          null) as PremisePublicAccess | null,
        premiseOwnership: dto.ownership as PremiseOwnership,
        premiseDeedNo: dto.deedNo?.trim() || null,
        premiseArea: dto.area ?? null,
        leaseIssuedAt: rented ? parseDate(dto.leaseIssuedAt) : null,
        leaseExpiresAt: rented ? parseDate(dto.leaseExpiresAt) : null,
        leaseAgency: rented ? dto.leaseAgency?.trim() || null : null,
        premiseOwnerName: rented ? dto.ownerName?.trim() || null : null,
      },
    });
    if (
      request.status === CaseRequestStatus.OPEN &&
      request.formationStep < 1
    ) {
      await this.prisma.caseRequest.update({
        where: { id: request.id },
        data: { formationStep: 1 },
      });
    }
    if (requestIsDone(request.status)) {
      const latest = await this.prisma.caseRequest.findFirst({
        where: {
          caseFileId: dto.caseId,
          type: CaseRequestType.LOCATION_CHANGE,
          status: {
            in: [CaseRequestStatus.COMPLETED, CaseRequestStatus.ISSUED],
          },
        },
        orderBy: [{ completedAt: 'desc' }, { id: 'desc' }],
        select: { id: true },
      });
      if (latest?.id === request.id) {
        const draft = await this.prisma.caseLocationDraft.findUnique({
          where: { requestId: request.id },
        });
        if (draft) {
          await this.prisma.caseFile.update({
            where: { id: dto.caseId },
            data: {
              premiseCityId: draft.premiseCityId,
              premiseEstablishment: draft.premiseEstablishment,
              premiseComplexId: draft.premiseComplexId,
              premiseAddress: draft.premiseAddress,
              premiseAddressEn: draft.premiseAddressEn,
              premisePlaque: draft.premisePlaque,
              premisePlaqueSeries: draft.premisePlaqueSeries,
              premiseFloor: draft.premiseFloor,
              premiseUnitNo: draft.premiseUnitNo,
              premisePostalCode: draft.premisePostalCode,
              premisePhone: draft.premisePhone,
              premiseFax: draft.premiseFax,
              premiseGeoPosition: draft.premiseGeoPosition,
              premisePublicAccess: draft.premisePublicAccess,
              premiseOwnership: draft.premiseOwnership,
              premiseDeedNo: draft.premiseDeedNo,
              premiseArea: draft.premiseArea,
              leaseIssuedAt: draft.leaseIssuedAt,
              leaseExpiresAt: draft.leaseExpiresAt,
              leaseAgency: draft.leaseAgency,
              premiseOwnerName: draft.premiseOwnerName,
            },
          });
        }
      }
    }
    return this.processState(dto.caseId, request.id, actorId);
  }

  async saveRenewalDates(
    caseId: string,
    nextIssuedAt: string,
    nextExpiresAt: string,
    actorId?: string,
    requestId?: string,
  ) {
    const request = requestId
      ? await this.prisma.caseRequest.findFirst({
          where: { id: requestId, caseFileId: caseId },
        })
      : await findOpenRequest(this.prisma, caseId);
    if (!request || request.type !== CaseRequestType.RENEWAL) {
      throw new BadRequestException(
        requestId ? 'درخواست تمدید یافت نشد' : 'درخواست تمدید باز نیست',
      );
    }
    await assertRequestMutable(this.prisma, request.id, actorId);
    const issued = parseDate(nextIssuedAt);
    const expires = parseDate(nextExpiresAt);
    if (!issued || !expires) {
      throw new BadRequestException('تاریخ صدور و تاریخ انقضا را وارد کنید');
    }
    if (expires.getTime() <= issued.getTime()) {
      throw new BadRequestException('تاریخ انقضا باید بعد از تاریخ صدور باشد');
    }
    const previous = requestIsDone(request.status)
      ? await this.prisma.caseRenewalTerms.findUnique({
          where: { requestId: request.id },
        })
      : null;
    await this.prisma.caseRenewalTerms.update({
      where: { requestId: request.id },
      data: { nextIssuedAt: issued, nextExpiresAt: expires },
    });
    if (previous) {
      const file = await this.prisma.caseFile.findUnique({
        where: { id: caseId },
        select: { licenseIssuedAt: true, licenseExpiresAt: true },
      });
      const sameDay = (
        left: Date | null | undefined,
        right: Date | null | undefined,
      ) =>
        (left ? left.toISOString().slice(0, 10) : null) ===
        (right ? right.toISOString().slice(0, 10) : null);
      if (
        file &&
        sameDay(file.licenseIssuedAt, previous.nextIssuedAt) &&
        sameDay(file.licenseExpiresAt, previous.nextExpiresAt)
      ) {
        await this.prisma.caseFile.update({
          where: { id: caseId },
          data: { licenseIssuedAt: issued, licenseExpiresAt: expires },
        });
        await syncCaseStatus(this.prisma, caseId);
      }
    }
    return this.processState(caseId, request.id, actorId);
  }

  async advanceProcess(
    caseId: string,
    step: number,
    actor?: { isAdmin?: boolean },
  ) {
    const request = await findOpenRequest(this.prisma, caseId);
    if (
      !request ||
      request.type === CaseRequestType.ISSUANCE ||
      !isProcessType(request.type)
    ) {
      throw new BadRequestException('درخواست تمدید یا تغییر مکان باز نیست');
    }
    const ceiling =
      request.type === CaseRequestType.RENEWAL ||
      request.type === CaseRequestType.LOCATION_CHANGE
        ? 5
        : 3;
    const requested = Math.min(Math.max(step, 0), ceiling);
    let next = Math.max(
      request.formationStep,
      Math.min(requested, request.formationStep + 1),
    );
    if (!actor?.isAdmin && next > 2) {
      throw new ForbiddenException(
        'ادامه بعد از ارجاع به استعلام با نقش‌های بعدی انجام می‌شود',
      );
    }
    if (
      (request.type === CaseRequestType.RENEWAL ||
        request.type === CaseRequestType.LOCATION_CHANGE) &&
      next === 1 &&
      (await this.processHasNoRequiredDocuments(caseId))
    ) {
      next = 2;
    }
    if (
      request.intakeSubmittedAt &&
      request.formationStep < 2 &&
      next >= 2
    ) {
      throw new BadRequestException(
        'ابتدا ثبت اولیه متقاضی باید توسط مدیریت تأیید شود',
      );
    }
    if (request.type === CaseRequestType.LOCATION_CHANGE && next >= 1) {
      const draft = await this.prisma.caseLocationDraft.findUnique({
        where: { requestId: request.id },
      });
      if (
        !draft?.premiseCityId ||
        !draft.premiseAddress ||
        !draft.premiseOwnership
      ) {
        throw new BadRequestException('اطلاعات محل جدید کامل نیست');
      }
    }
    if (next >= 2)
      await this.assertActivityDocumentsDelivered(caseId, request.id);
    if (next >= 3) await this.inquiries.assertDelivered(caseId);
    if (
      (request.type === CaseRequestType.RENEWAL ||
        request.type === CaseRequestType.LOCATION_CHANGE) &&
      next >= 3
    ) {
      await this.places.ensureForUser(caseId);
    }
    if (
      (request.type === CaseRequestType.RENEWAL ||
        request.type === CaseRequestType.LOCATION_CHANGE) &&
      next >= 4
    ) {
      await this.places.assertDelivered(caseId);
    }
    if (
      (request.type === CaseRequestType.RENEWAL ||
        request.type === CaseRequestType.LOCATION_CHANGE) &&
      next >= 5
    ) {
      await this.managementApprovers.assertDelivered(caseId);
    }
    const saved = await this.prisma.caseRequest.update({
      where: { id: request.id },
      data: { formationStep: next },
      select: { formationStep: true },
    });
    if (
      (request.type === CaseRequestType.RENEWAL ||
        request.type === CaseRequestType.LOCATION_CHANGE) &&
      next >= 2
    ) {
      await this.inquiries.referOpenRequest(caseId);
    }
    if (
      (request.type === CaseRequestType.RENEWAL ||
        request.type === CaseRequestType.LOCATION_CHANGE) &&
      next >= 3
    ) {
      await this.places.referOpenRequest(caseId);
    }
    return saved;
  }

  async completeRequest(
    caseId: string,
    actorId?: string,
    licenseIssuedAt?: string,
    licenseExpiresAt?: string,
  ) {
    const request = await findOpenRequest(this.prisma, caseId);
    if (!request) throw new BadRequestException('درخواست بازی برای تکمیل نیست');
    if (request.type === CaseRequestType.RENEWAL) {
      if (request.formationStep < 5) {
        throw new BadRequestException(
          'مرحله‌های این درخواست هنوز تمام نشده است',
        );
      }
      await this.inquiries.ensureForUser(caseId);
      await this.places.ensureForUser(caseId);
      await this.managementApprovers.ensureForUser(caseId);
    } else if (request.type === CaseRequestType.LOCATION_CHANGE) {
      if (request.formationStep < 5) {
        throw new BadRequestException(
          'مرحله‌های این درخواست هنوز تمام نشده است',
        );
      }
      await this.inquiries.ensureForUser(caseId);
      await this.places.ensureForUser(caseId);
      await this.managementApprovers.ensureForUser(caseId);
    } else if (request.type !== CaseRequestType.ISSUANCE) {
      if (request.formationStep < 3) {
        throw new BadRequestException(
          'مرحله‌های این درخواست هنوز تمام نشده است',
        );
      }
      await this.inquiries.ensureForUser(caseId);
      await this.managementApprovers.ensureForUser(caseId);
    }
    if (request.type === CaseRequestType.ISSUANCE) {
      await this.places.ensureForUser(caseId);
      await this.managementApprovers.ensureForUser(caseId);
      await this.inquiries.ensureForUser(caseId);
    }
    return completeOpenRequest(this.prisma, caseId, actorId, {
      issuedAt: parseDate(licenseIssuedAt),
      expiresAt: parseDate(licenseExpiresAt),
    });
  }

  async advanceStep(dto: SaveFormationStepDto, actor?: { isAdmin?: boolean }) {
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
    if (!actor?.isAdmin && requested > INQUIRIES_FORMATION_STEP) {
      throw new ForbiddenException(
        'ادامه بعد از ارجاع به استعلام با نقش‌های بعدی انجام می‌شود',
      );
    }
    if (
      user.formationStep < PLACES_FORMATION_STEP &&
      requested >= PLACES_FORMATION_STEP
    ) {
      await this.assertActivityDocumentsDelivered(user.id);
      await this.inquiries.assertDelivered(user.id);
    }
    if (
      user.formationStep < MANAGEMENT_FORMATION_STEP &&
      requested >= MANAGEMENT_FORMATION_STEP
    ) {
      await this.places.assertDelivered(user.id);
    }
    if (
      user.formationStep < ISSUANCE_FORMATION_STEP &&
      requested >= ISSUANCE_FORMATION_STEP
    ) {
      await this.managementApprovers.assertDelivered(user.id);
    }
    const formationStep = Math.max(user.formationStep, requested);
    const saved = await this.prisma.caseFile.update({
      where: { id: user.id },
      data: { formationStep },
      select: { id: true, formationStep: true },
    });
    await syncIssuanceRequest(this.prisma, saved.id);
    if (
      user.formationStep < INQUIRIES_FORMATION_STEP &&
      formationStep >= INQUIRIES_FORMATION_STEP
    ) {
      await this.inquiries.referOpenRequest(saved.id);
    }
    if (
      user.formationStep < PLACES_FORMATION_STEP &&
      formationStep >= PLACES_FORMATION_STEP
    ) {
      await this.places.referOpenRequest(saved.id);
    }
    return saved;
  }

  /** تأیید مدیریت روی ثبت اولیهٔ متقاضی؛ بعد از آن ارجاع استعلام ساخته می‌شود. */
  async approveIntake(caseId: string) {
    const request = await findOpenRequest(this.prisma, caseId);
    if (!request?.intakeSubmittedAt) {
      throw new BadRequestException('درخواست هنوز توسط متقاضی ثبت اولیه نشده است');
    }
    if (request.type === CaseRequestType.ISSUANCE) {
      return this.approveIssuanceIntake(caseId, request);
    }
    if (
      request.type === CaseRequestType.RENEWAL ||
      request.type === CaseRequestType.LOCATION_CHANGE
    ) {
      if (request.formationStep >= 2) {
        throw new BadRequestException('این درخواست قبلاً به استعلام ارجاع شده است');
      }
      await this.assertActivityDocumentsDelivered(caseId, request.id);
      await this.prisma.caseRequest.update({
        where: { id: request.id },
        data: { formationStep: 2 },
      });
      await this.inquiries.referOpenRequest(caseId);
      return { formationStep: 2 };
    }
    if (request.type === CaseRequestType.AUCTION) {
      if (request.formationStep >= 1) {
        throw new BadRequestException('این درخواست قبلاً تأیید شده است');
      }
      await this.prisma.caseRequest.update({
        where: { id: request.id },
        data: { formationStep: 1 },
      });
      await this.inquiries.referOpenRequest(caseId);
      await this.auction.syncPhase(request.id);
      return { formationStep: 1 };
    }
    throw new BadRequestException('این درخواست تأیید ثبت اولیه ندارد');
  }

  private async approveIssuanceIntake(
    caseId: string,
    request: { id: string; type: CaseRequestType },
  ) {
    const file = await this.prisma.caseFile.findUnique({
      where: { id: caseId },
      select: {
        id: true,
        userId: true,
        formationStep: true,
        activityJobId: true,
        businessUnitTitle: true,
        premiseCityId: true,
        premiseAddress: true,
        premiseOwnership: true,
        user: { select: { gender: true } },
      },
    });
    if (!file) throw new NotFoundException('پرونده یافت نشد');
    if (file.formationStep >= INQUIRIES_FORMATION_STEP) {
      throw new BadRequestException('این پرونده قبلاً به استعلام ارجاع شده است');
    }
    if (
      !file.activityJobId ||
      !file.businessUnitTitle?.trim() ||
      !file.premiseCityId ||
      !file.premiseAddress?.trim() ||
      !file.premiseOwnership
    ) {
      throw new BadRequestException('اطلاعات سه بخش اول کامل نیست');
    }
    const requiredActivity = await resolveDocumentRequirements(
      this.prisma,
      request.type,
      file.activityJobId,
      file.user.gender,
    );
    const storedActivity = await this.prisma.caseActivityDocument.findMany({
      where: { caseRequestId: request.id, versions: { some: {} } },
      select: { documentId: true },
    });
    const activityIds = new Set(storedActivity.map((item) => item.documentId));
    const requiredIdentity = await this.prisma.caseIdentityDocument.findMany({
      where: {
        isRequired: true,
        OR: [
          { gender: 'BOTH' },
          ...(file.user.gender ? [{ gender: file.user.gender }] : []),
        ],
      },
      select: { documentId: true },
    });
    const storedIdentity = await this.prisma.personDocument.findMany({
      where: {
        userId: file.userId,
        versions: { some: {} },
        documentId: { in: requiredIdentity.map((item) => item.documentId) },
      },
      select: { documentId: true },
    });
    const identityIds = new Set(storedIdentity.map((item) => item.documentId));
    if (
      requiredActivity.some((item) => item.isRequired && !activityIds.has(item.id)) ||
      requiredIdentity.some((item) => !identityIds.has(item.documentId))
    ) {
      throw new BadRequestException('مدارک الزامی سه بخش اول کامل نیست');
    }
    await this.prisma.caseFile.update({
      where: { id: file.id },
      data: { formationStep: INQUIRIES_FORMATION_STEP },
    });
    await syncIssuanceRequest(this.prisma, file.id);
    await this.inquiries.referOpenRequest(file.id);
    return { formationStep: INQUIRIES_FORMATION_STEP };
  }

  /** بعد از ثبت آخرین نتیجهٔ استعلام، پرونده به اماکن می‌رود. */
  async advanceToPlacesAfterInquiry(inquiryId: string) {
    const inquiry = await this.prisma.caseInquiry.findUnique({
      where: { id: inquiryId },
      select: {
        caseFileId: true,
        caseRequestId: true,
        caseRequest: {
          select: { type: true, status: true, formationStep: true },
        },
      },
    });
    if (!inquiry || !requestIsOpen(inquiry.caseRequest.status)) return null;
    const [total, pending] = await Promise.all([
      this.prisma.caseInquiry.count({
        where: { caseRequestId: inquiry.caseRequestId },
      }),
      this.prisma.caseInquiry.count({
        where: {
          caseRequestId: inquiry.caseRequestId,
          status: CaseInquiryStatus.PENDING,
        },
      }),
    ]);
    if (total === 0 || pending > 0) return null;
    const request = inquiry.caseRequest;

    if (request.type === CaseRequestType.ISSUANCE) {
      const user = await this.prisma.caseFile.findUnique({
        where: { id: inquiry.caseFileId },
        select: { id: true, formationStep: true },
      });
      if (!user || user.formationStep !== PLACES_FORMATION_STEP - 1)
        return null;
      await this.assertActivityDocumentsDelivered(
        user.id,
        inquiry.caseRequestId,
      );
      await this.inquiries.assertDelivered(user.id);
      const saved = await this.prisma.caseFile.update({
        where: { id: user.id },
        data: { formationStep: PLACES_FORMATION_STEP },
        select: { id: true, formationStep: true },
      });
      await syncIssuanceRequest(this.prisma, saved.id);
      await this.places.referOpenRequest(saved.id);
      return saved;
    }

    if (
      request.type === CaseRequestType.RENEWAL ||
      request.type === CaseRequestType.LOCATION_CHANGE
    ) {
      if (request.formationStep !== 2) return null;
      await this.assertActivityDocumentsDelivered(
        inquiry.caseFileId,
        inquiry.caseRequestId,
      );
      await this.inquiries.assertDelivered(inquiry.caseFileId);
      await this.places.ensureForUser(inquiry.caseFileId);
      const saved = await this.prisma.caseRequest.update({
        where: { id: inquiry.caseRequestId },
        data: { formationStep: 3 },
        select: { formationStep: true },
      });
      await this.places.referOpenRequest(inquiry.caseFileId);
      return saved;
    }

    if (request.type === CaseRequestType.STEWARDSHIP) {
      if (request.formationStep !== STEWARDSHIP_INQUIRY_STEP) return null;
      await this.inquiries.assertDelivered(inquiry.caseFileId);
      await this.places.ensureForUser(inquiry.caseFileId);
      await this.prisma.$transaction([
        this.prisma.caseRequest.update({
          where: { id: inquiry.caseRequestId },
          data: { formationStep: STEWARDSHIP_PLACES_STEP },
        }),
        this.prisma.caseFile.updateMany({
          where: {
            id: inquiry.caseFileId,
            formationStep: STEWARDSHIP_INQUIRY_STEP,
            cardNumber: null,
          },
          data: { formationStep: STEWARDSHIP_PLACES_STEP },
        }),
      ]);
      await this.places.referOpenRequest(inquiry.caseFileId);
      return { formationStep: STEWARDSHIP_PLACES_STEP };
    }
    return null;
  }

  async listReadyToIssue(query: FindIssuanceQueryDto) {
    const { skip, take, page, pageSize } = paginationArgs(query);
    const digits = normalizeSearchDigits(query.q ?? '');
    const where: Prisma.CaseRequestWhereInput = {
      status: CaseRequestStatus.OPEN,
      AND: [
        issuanceReachedWhere(),
        ...(query.q
          ? [
              {
                OR: [
                  { number: containsInsensitive(query.q) },
                  {
                    caseFile: {
                      user: { fullName: containsInsensitive(query.q) },
                    },
                  },
                  {
                    caseFile: {
                      businessUnitTitle: containsInsensitive(query.q),
                    },
                  },
                  {
                    caseFile: {
                      activityJob: { title: containsInsensitive(query.q) },
                    },
                  },
                  { caseFile: { trackingCode: containsInsensitive(query.q) } },
                  ...(digits
                    ? [
                        {
                          caseFile: {
                            user: { nationalId: { contains: digits } },
                          },
                        },
                        { caseFile: { trackingCode: { contains: digits } } },
                      ]
                    : []),
                ],
              },
            ]
          : []),
      ],
    };
    const orderBy =
      resolveSortOrder<Prisma.CaseRequestOrderByWithRelationInput>(
        query.sortBy,
        query.sortDir,
        {
          applicant: (dir) => ({ caseFile: { user: { fullName: dir } } }),
          nationalId: (dir) => ({ caseFile: { user: { nationalId: dir } } }),
          job: (dir) => ({ caseFile: { activityJob: { title: dir } } }),
          requestType: (dir) => ({ type: dir }),
          requestNumber: (dir) => ({ number: dir }),
          createdAt: (dir) => ({ createdAt: dir }),
        },
        [{ createdAt: 'desc' }, { id: 'asc' }],
      );
    const [rows, total] = await Promise.all([
      this.prisma.caseRequest.findMany({
        where,
        orderBy,
        skip,
        take,
        select: {
          id: true,
          type: true,
          number: true,
          createdAt: true,
          caseFileId: true,
          caseFile: {
            select: {
              trackingCode: true,
              businessUnitTitle: true,
              activityJob: { select: { title: true } },
              user: { select: { fullName: true, nationalId: true } },
            },
          },
        },
      }),
      this.prisma.caseRequest.count({ where }),
    ]);
    return paginatedResult(
      rows.map((row) => ({
        id: row.id,
        caseFileId: row.caseFileId,
        requestId: row.id,
        requestType: row.type,
        requestNumber: row.number,
        fullName: row.caseFile.user.fullName,
        nationalId: row.caseFile.user.nationalId,
        jobTitle: row.caseFile.activityJob?.title ?? null,
        unitTitle: row.caseFile.businessUnitTitle,
        trackingCode: row.caseFile.trackingCode,
        createdAt: row.createdAt,
      })),
      total,
      page,
      pageSize,
    );
  }

  /** کارتابل اماکن به ترتیب آخرین ارجاع هر پرونده. مرتب‌سازی روی رابطهٔ چندتایی در خود Prisma نیست. */
  private async orderedReferredCaseIds(
    where: Prisma.CaseFileWhereInput,
    query: FindCasesQueryDto,
  ) {
    const reviews = await this.prisma.casePlacesReview.findMany({
      where: { referredAt: { not: null }, caseFile: where },
      orderBy: [{ referredAt: 'desc' }, { id: 'asc' }],
      select: {
        caseFileId: true,
        referredAt: true,
        decidedAt: true,
        decidedBy: { select: { fullName: true } },
      },
    });
    const latest: {
      caseFileId: string;
      referredAt: Date;
      decidedAt: Date | null;
      decidedByName: string | null;
    }[] = [];
    const seen = new Set<string>();
    for (const review of reviews) {
      if (!review.referredAt || seen.has(review.caseFileId)) continue;
      seen.add(review.caseFileId);
      latest.push({
        caseFileId: review.caseFileId,
        referredAt: review.referredAt,
        decidedAt: review.decidedAt,
        decidedByName: review.decidedBy?.fullName ?? null,
      });
    }
    const sortBy = query.sortBy;
    if (
      sortBy === 'placesReferredAt' ||
      sortBy === 'placesDecidedAt' ||
      sortBy === 'placesDecidedBy'
    ) {
      const asc = query.sortDir === 'asc';
      latest.sort((left, right) => {
        if (sortBy === 'placesDecidedBy') {
          return directedCompare(
            compareNullableText(left.decidedByName, right.decidedByName),
            asc,
            !left.decidedByName,
            !right.decidedByName,
          );
        }
        const leftAt =
          sortBy === 'placesDecidedAt' ? left.decidedAt : left.referredAt;
        const rightAt =
          sortBy === 'placesDecidedAt' ? right.decidedAt : right.referredAt;
        return directedCompare(
          compareNullableTime(leftAt, rightAt),
          asc,
          leftAt == null,
          rightAt == null,
        );
      });
    }
    const total = latest.length;
    const ids = latest.map((row) => row.caseFileId);
    if (!wantsPagination(query)) return { ids, total };
    const { skip, take } = paginationArgs(query);
    return { ids: ids.slice(skip, skip + take), total };
  }

  async list(query: FindCasesQueryDto, scope?: { placesOnly?: boolean }) {
    const q = query.q?.trim();
    const digits = q ? normalizeSearchDigits(q) : '';
    const licenseQuery = q ? toLatinDigits(q).trim() : '';
    const where: Prisma.CaseFileWhereInput = {
      userId: query.userId,
      status: query.status,
      formationStep:
        query.step != null
          ? query.step
          : scope?.placesOnly ||
              query.caseKind === 'STEWARD_REQUEST' ||
              query.caseKind === 'STEWARD_CARD'
            ? undefined
            : { gt: 0 },
      ...(scope?.placesOnly
        ? { placesReviews: { some: { referredAt: { not: null } } } }
        : {}),
      ...(scope?.placesOnly &&
      query.placesView &&
      query.placesView !== 'referred'
        ? { id: { in: await this.places.caseIdsForView(query.placesView) } }
        : {}),
      activityJobId: query.jobId,
      activityJob: query.jobGroupId ? { groupId: query.jobGroupId } : undefined,
      ...caseKindWhere(query.caseKind),
      user: {
        gender: query.gender,
        residencyStatus: query.residencyStatus,
        educationLevel: query.educationLevel,
      },
      OR: q
        ? [
            { user: { firstName: containsInsensitive(q) } },
            { user: { lastName: containsInsensitive(q) } },
            { user: { fullName: containsInsensitive(q) } },
            ...(licenseQuery
              ? [{ licenseNumber: containsInsensitive(licenseQuery) }]
              : []),
            ...(digits
              ? [
                  { user: { nationalId: { contains: digits } } },
                  { user: { phone: { contains: digits } } },
                ]
              : []),
          ]
        : undefined,
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
        licenseNumber: (dir) => ({ licenseNumber: dir }),
        formationStep: (dir) => ({ formationStep: dir }),
      },
      [{ createdAt: 'desc' }, { id: 'asc' }],
    );
    const select = {
      id: true,
      kind: true,
      formationStep: true,
      trackingCode: true,
      businessUnitTitle: true,
      status: true,
      revokeReason: true,
      revokedAt: true,
      revokedBy: { select: { fullName: true } },
      cardNumber: true,
      cardIssuedAt: true,
      cardExpiresAt: true,
      hostCaseFile: {
        select: {
          businessUnitTitle: true,
          licenseNumber: true,
          licenseIssuedAt: true,
          licenseExpiresAt: true,
          status: true,
          revokeReason: true,
          revokedAt: true,
          revokedBy: { select: { fullName: true } },
          premiseCity: { select: { nameFa: true, nameEn: true } },
          suspensions: {
            orderBy: [
              { startsAt: 'desc' },
              { createdAt: 'desc' },
              { id: 'desc' },
            ],
            select: { startsAt: true, endsAt: true, liftedAt: true },
          },
          user: { select: { nationalId: true, fullName: true } },
          activityJob: {
            select: {
              id: true,
              title: true,
              group: { select: { id: true, title: true } },
            },
          },
        },
      },
      licenseNumber: true,
      licenseIssuedAt: true,
      licenseExpiresAt: true,
      suspensions: {
        orderBy: [{ startsAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
        select: { startsAt: true, endsAt: true, liftedAt: true },
      },
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
          photoId: true,
        },
      },
      requests: {
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: { type: true, status: true, formationStep: true, intakeSubmittedAt: true },
      },
      placesReviews: {
        where: { referredAt: { not: null } },
        orderBy: [{ referredAt: 'desc' }, { id: 'desc' }],
        take: 1,
        select: {
          status: true,
          referredAt: true,
          decidedAt: true,
          decidedBy: { select: { fullName: true } },
        },
      },
    } satisfies Prisma.CaseFileSelect;

    const today = parseDate(localTodayIso())!;
    const mapRow = (
      row: Prisma.CaseFileGetPayload<{ select: typeof select }>,
    ) => {
      const status = row.status;
      const activeSuspension =
        status === CaseFileStatus.SUSPENDED
          ? row.suspensions.find((item) => suspensionIsActive(item, today))
          : null;
      const steward = row.kind === CaseFileKind.STEWARDSHIP;
      return {
        id: row.id,
        kind: row.kind,
        caseKind: resolveListCaseKind(row.kind, row.requests),
        requests: row.requests.map((request) => ({
          type: request.type,
          status: request.status,
        })),
        formationStep: row.formationStep,
        intakeSubmittedAt: pendingIntakeIso(row.requests, row.formationStep),
        trackingCode: row.trackingCode,
        status,
        revokeReason:
          status === CaseFileStatus.REVOKED ? row.revokeReason : null,
        revokedAt:
          status === CaseFileStatus.REVOKED
            ? (row.revokedAt?.toISOString() ?? null)
            : null,
        revokedBy:
          status === CaseFileStatus.REVOKED && row.revokedBy
            ? { fullName: row.revokedBy.fullName }
            : null,
        suspensionStartsAt: activeSuspension
          ? dateOnly(activeSuspension.startsAt)
          : null,
        licenseNumber: steward ? row.cardNumber : row.licenseNumber,
        licenseIssuedAt: dateOnly(
          steward ? row.cardIssuedAt : row.licenseIssuedAt,
        ),
        licenseExpiresAt: dateOnly(
          steward ? row.cardExpiresAt : row.licenseExpiresAt,
        ),
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
        photoId: row.user.photoId,
        job: steward
          ? (row.hostCaseFile?.activityJob ?? null)
          : row.activityJob,
        jobTitle: steward
          ? (row.hostCaseFile?.businessUnitTitle ?? null)
          : row.businessUnitTitle,
        city: row.premiseCity,
        cardNumber: row.cardNumber,
        cardIssuedAt: dateOnly(row.cardIssuedAt),
        cardExpiresAt: dateOnly(row.cardExpiresAt),
        host:
          steward && row.hostCaseFile
            ? {
                licenseNumber: row.hostCaseFile.licenseNumber,
                licenseIssuedAt: dateOnly(row.hostCaseFile.licenseIssuedAt),
                licenseExpiresAt: dateOnly(row.hostCaseFile.licenseExpiresAt),
                city: row.hostCaseFile.premiseCity,
                nationalId: row.hostCaseFile.user.nationalId,
                fullName: row.hostCaseFile.user.fullName,
                status: row.hostCaseFile.status,
                revokeReason:
                  row.hostCaseFile.status === CaseFileStatus.REVOKED
                    ? row.hostCaseFile.revokeReason
                    : null,
                revokedAt:
                  row.hostCaseFile.status === CaseFileStatus.REVOKED
                    ? (row.hostCaseFile.revokedAt?.toISOString() ?? null)
                    : null,
                revokedBy:
                  row.hostCaseFile.status === CaseFileStatus.REVOKED &&
                  row.hostCaseFile.revokedBy
                    ? { fullName: row.hostCaseFile.revokedBy.fullName }
                    : null,
              }
            : null,
        placesStatus: row.placesReviews[0]?.status ?? null,
        placesReferredAt:
          row.placesReviews[0]?.referredAt?.toISOString() ?? null,
        placesDecidedAt: row.placesReviews[0]?.decidedAt?.toISOString() ?? null,
        placesDecidedByName: row.placesReviews[0]?.decidedBy?.fullName ?? null,
      };
    };

    const placesDateSort =
      !query.sortBy ||
      query.sortBy === 'placesReferredAt' ||
      query.sortBy === 'placesDecidedAt' ||
      query.sortBy === 'placesDecidedBy';
    if (scope?.placesOnly && placesDateSort) {
      const ordered = await this.orderedReferredCaseIds(where, query);
      const rows = ordered.ids.length
        ? await this.prisma.caseFile.findMany({
            where: { id: { in: ordered.ids } },
            select,
          })
        : [];
      const byId = new Map(rows.map((row) => [row.id, row]));
      const items = ordered.ids.flatMap((id) => {
        const row = byId.get(id);
        return row ? [mapRow(row)] : [];
      });
      if (!wantsPagination(query)) return items;
      const { page, pageSize } = paginationArgs(query);
      return paginatedResult(items, ordered.total, page, pageSize);
    }

    if (!wantsPagination(query)) {
      const items = await this.prisma.caseFile.findMany({
        where,
        orderBy,
        select,
      });
      return items.map(mapRow);
    }
    const { page, pageSize, skip, take } = paginationArgs(query);
    const [items, total] = await Promise.all([
      this.prisma.caseFile.findMany({ where, orderBy, skip, take, select }),
      this.prisma.caseFile.count({ where }),
    ]);
    return paginatedResult(items.map(mapRow), total, page, pageSize);
  }

  /** آخرین اطلاعات خود پرونده؛ استعلام، اماکن و تایید مدیریت این‌جا نیستند. */
  async dossier(id: string, userId: string) {
    const file = await this.prisma.caseFile.findUnique({
      where: { id },
      select: {
        ...caseFileSelect,
        status: true,
        licenseNumber: true,
        licenseIssuedAt: true,
        licenseExpiresAt: true,
        hostCaseFileId: true,
        cardNumber: true,
        cardIssuedAt: true,
        cardExpiresAt: true,
        revokeSource: true,
        premiseCity: { select: { nameFa: true, nameEn: true } },
        premiseComplex: { select: { name: true, nameEn: true } },
        registrationPlace: { select: { title: true } },
        premiseHistory: {
          orderBy: [{ endedAt: 'desc' }, { id: 'desc' }],
          select: {
            id: true,
            startedAt: true,
            endedAt: true,
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
            premiseCity: { select: { nameFa: true, nameEn: true } },
            premiseComplex: { select: { name: true, nameEn: true } },
            registrationPlace: { select: { title: true } },
          },
        },
        user: { select: personSelect },
        suspensions: {
          where: { liftedAt: null },
          select: { startsAt: true, endsAt: true, liftedAt: true },
        },
        requests: {
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          select: {
            id: true,
            type: true,
            number: true,
            status: true,
            createdAt: true,
            activityDocuments: {
              orderBy: [{ document: { title: 'asc' } }, { id: 'asc' }],
              select: {
                documentId: true,
                document: { select: { title: true } },
                versions: {
                  orderBy: { version: 'desc' },
                  take: 1,
                  select: {
                    id: true,
                    originalName: true,
                    mimeType: true,
                    byteSize: true,
                    createdAt: true,
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!file || file.formationStep < 1)
      throw new NotFoundException('پرونده یافت نشد');
    const requestTypes = [
      ...new Set(file.requests.map((request) => request.type)),
    ];
    const requirementRows = await Promise.all(
      requestTypes.map(async (type) => {
        const rows = await resolveDocumentRequirements(
          this.prisma,
          type,
          file.activityJob?.id ?? null,
          file.user.gender,
        );
        return [
          type,
          new Map(rows.map((row) => [row.id, row.isRequired])),
        ] as const;
      }),
    );
    const requirementByType = new Map(requirementRows);
    const identityRows = await this.prisma.personDocument.findMany({
      where: { userId: file.userId },
      orderBy: [{ document: { title: 'asc' } }, { id: 'asc' }],
      select: {
        documentId: true,
        document: {
          select: {
            title: true,
            caseIdentityDocument: { select: { isRequired: true } },
          },
        },
        versions: {
          orderBy: { version: 'desc' },
          take: 1,
          select: {
            id: true,
            originalName: true,
            mimeType: true,
            byteSize: true,
            createdAt: true,
          },
        },
      },
    });
    const storedFile = (
      version:
        | {
            id: string;
            originalName: string | null;
            mimeType: string;
            byteSize: number;
            createdAt: Date;
          }
        | undefined,
    ) =>
      version
        ? {
            id: version.id,
            originalName: version.originalName,
            mimeType: version.mimeType,
            byteSize: version.byteSize,
            createdAt: version.createdAt.toISOString(),
          }
        : null;
    const status = (await syncCaseStatus(this.prisma, file.id)) ?? file.status;
    const issuedEdit = file.licenseNumber
      ? await this.generalSettings.userMayEditIssuedCase(userId)
      : true;
    const stewards =
      file.kind === CaseFileKind.LICENSE
        ? await this.stewardship.listForHost(file.id)
        : [];
    const host =
      file.kind === CaseFileKind.STEWARDSHIP && file.hostCaseFileId
        ? await this.prisma.caseFile.findUnique({
            where: { id: file.hostCaseFileId },
            select: {
              id: true,
              licenseNumber: true,
              user: {
                select: { firstName: true, lastName: true, fullName: true },
              },
            },
          })
        : null;
    return {
      id: file.id,
      status,
      formationStep: file.formationStep,
      trackingCode: file.trackingCode,
      canEditCase: !file.licenseNumber || issuedEdit === true,
      licenseNumber: file.licenseNumber,
      licenseIssuedAt: dateOnly(file.licenseIssuedAt),
      licenseExpiresAt: dateOnly(file.licenseExpiresAt),
      businessUnitTitle: file.businessUnitTitle,
      person: mapIdentity(file.user),
      activity: {
        ...mapActivity(file),
        jobTypeTitle: file.activityJob?.jobType?.title ?? null,
      },
      location: {
        ...mapLocation(file),
        city: file.premiseCity,
        complex: file.premiseComplex,
        registrationPlaceTitle: file.registrationPlace?.title ?? null,
      },
      locationHistory: file.premiseHistory.map((row) => ({
        id: row.id,
        startedAt: row.startedAt.toISOString(),
        endedAt: row.endedAt.toISOString(),
        ...mapLocation(row),
        city: row.premiseCity,
        complex: row.premiseComplex
          ? { name: row.premiseComplex.name, nameEn: row.premiseComplex.nameEn }
          : null,
        registrationPlaceTitle: row.registrationPlace?.title ?? null,
      })),
      identityDocuments: identityRows.flatMap((row) => {
        const current = storedFile(row.versions[0]);
        if (!current) return [];
        return [
          {
            documentId: row.documentId,
            title: row.document.title,
            isRequired: row.document.caseIdentityDocument?.isRequired ?? false,
            file: current,
          },
        ];
      }),
      requestDocuments: file.requests.flatMap((request) => {
        const documents = request.activityDocuments.flatMap((row) => {
          const current = storedFile(row.versions[0]);
          if (!current) return [];
          return [
            {
              documentId: row.documentId,
              title: row.document.title,
              isRequired:
                requirementByType.get(request.type)?.get(row.documentId) ??
                false,
              file: current,
            },
          ];
        });
        if (documents.length === 0) return [];
        return [
          {
            id: request.id,
            type: request.type,
            number: request.number,
            status: request.status,
            createdAt: request.createdAt.toISOString(),
            documents,
          },
        ];
      }),
      kind: file.kind,
      cardNumber: file.cardNumber,
      cardIssuedAt: dateOnly(file.cardIssuedAt),
      cardExpiresAt: dateOnly(file.cardExpiresAt),
      revokeSource:
        file.status === CaseFileStatus.REVOKED ? file.revokeSource : null,
      stewards,
      host: host
        ? {
            id: host.id,
            licenseNumber: host.licenseNumber,
            firstName: host.user.firstName,
            lastName: host.user.lastName,
            fullName: host.user.fullName,
          }
        : null,
    };
  }

  async findOne(id: string) {
    await syncIssuanceRequest(this.prisma, id, { createIfMissing: false });
    const file = await this.prisma.caseFile.findUnique({
      where: { id },
      select: {
        id: true,
        kind: true,
        status: true,
        revokeReason: true,
        revokeSource: true,
        revokedAt: true,
        revokedBy: { select: { id: true, fullName: true } },
        reactivatedAt: true,
        cardNumber: true,
        cardIssuedAt: true,
        cardExpiresAt: true,
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
          select: {
            id: true,
            title: true,
            group: { select: { id: true, title: true } },
          },
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
        hostCaseFile: {
          select: {
            id: true,
            licenseNumber: true,
            businessUnitTitle: true,
            activityJob: {
              select: {
                title: true,
                group: { select: { title: true } },
                jobType: { select: { title: true } },
              },
            },
            user: {
              select: {
                firstName: true,
                lastName: true,
                fullName: true,
                gender: true,
                phone: true,
              },
            },
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
            intakeSubmittedAt: true,
            completedAt: true,
            createdAt: true,
            renewalTerms: {
              select: {
                currentIssuedAt: true,
                currentExpiresAt: true,
                nextIssuedAt: true,
                nextExpiresAt: true,
              },
            },
            auction: { select: { startsAt: true, endsAt: true } },
            placesReview: { select: { status: true } },
          },
        },
        suspensions: {
          orderBy: [
            { startsAt: 'desc' },
            { createdAt: 'desc' },
            { id: 'desc' },
          ],
          select: {
            id: true,
            reason: true,
            startsAt: true,
            endsAt: true,
            liftNote: true,
            liftedAt: true,
            files: {
              orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
              select: {
                id: true,
                kind: true,
                originalName: true,
                mimeType: true,
              },
            },
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
    const today = parseDate(localTodayIso())!;
    const status = (await syncCaseStatus(this.prisma, file.id)) ?? file.status;
    const suspensions = file.suspensions.map((row) => ({
      id: row.id,
      reason: row.reason,
      startsAt: dateOnly(row.startsAt)!,
      endsAt: dateOnly(row.endsAt),
      liftNote: row.liftNote,
      files: row.files,
      active: suspensionIsActive(row, today),
    }));
    const [violationCount, unpaidDebt] = await Promise.all([
      file.user.nationalId
        ? this.prisma.violation.count({
            where: { nationalId: file.user.nationalId },
          })
        : 0,
      unpaidDebtForCase(this.prisma, file.id),
    ]);
    const ownLicense =
      file.kind === CaseFileKind.STEWARDSHIP
        ? await this.prisma.caseFile.findFirst({
            where: {
              userId: file.user.id,
              kind: CaseFileKind.LICENSE,
              licenseNumber: { not: null },
            },
            select: { id: true },
          })
        : { id: file.id };
    const premiseHistory = file.premiseHistory.map((row) => ({
      id: row.id,
      address: row.premiseAddress,
      plaque: row.premisePlaque,
      ownership: row.premiseOwnership,
      city: row.premiseCity,
      startedAt: dateOnly(row.startedAt),
      endedAt: dateOnly(row.endedAt),
    }));
    const currentStartedAt =
      file.premiseHistory.at(-1)?.endedAt ?? file.licenseIssuedAt;
    const firstRenewal = [...file.requests]
      .filter((row) => row.type === CaseRequestType.RENEWAL && row.renewalTerms)
      .sort(
        (left, right) => left.createdAt.getTime() - right.createdAt.getTime(),
      )[0];
    return {
      id: file.id,
      kind: file.kind,
      status,
      cardNumber: file.cardNumber,
      cardIssuedAt: dateOnly(file.cardIssuedAt),
      cardExpiresAt: dateOnly(file.cardExpiresAt),
      revokeSource:
        file.status === CaseFileStatus.REVOKED ? file.revokeSource : null,
      hasOwnLicense: Boolean(ownLicense),
      host: file.hostCaseFile
        ? {
            id: file.hostCaseFile.id,
            licenseNumber: file.hostCaseFile.licenseNumber,
            businessUnitTitle: file.hostCaseFile.businessUnitTitle,
            gender: file.hostCaseFile.user.gender,
            firstName: file.hostCaseFile.user.firstName,
            lastName: file.hostCaseFile.user.lastName,
            fullName: file.hostCaseFile.user.fullName,
            phone: file.hostCaseFile.user.phone,
            jobGroupTitle: file.hostCaseFile.activityJob?.group?.title ?? null,
            jobTitle: file.hostCaseFile.activityJob?.title ?? null,
            jobTypeTitle: file.hostCaseFile.activityJob?.jobType?.title ?? null,
          }
        : null,
      revokeReason:
        file.status === CaseFileStatus.REVOKED ? file.revokeReason : null,
      revokedAt:
        file.status === CaseFileStatus.REVOKED
          ? (file.revokedAt?.toISOString() ?? null)
          : null,
      revokedBy:
        file.status === CaseFileStatus.REVOKED && file.revokedBy
          ? { id: file.revokedBy.id, fullName: file.revokedBy.fullName }
          : null,
      reactivatedAt: file.reactivatedAt?.toISOString() ?? null,
      violationCount,
      unpaidDebt,
      suspensionCount: suspensions.length,
      suspensions,
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
      requests: file.requests.map((request) => {
        const done =
          request.status === 'ISSUED' || request.status === 'COMPLETED';
        let issuedAt: string | null = null;
        let expiresAt: string | null = null;
        let auctionStartsAt: string | null = null;
        let auctionEndsAt: string | null = null;
        if (request.type === CaseRequestType.AUCTION) {
          auctionStartsAt = dateOnly(request.auction?.startsAt ?? null);
          auctionEndsAt = dateOnly(request.auction?.endsAt ?? null);
        } else if (
          request.type === CaseRequestType.RENEWAL &&
          done &&
          request.renewalTerms
        ) {
          issuedAt = dateOnly(request.renewalTerms.nextIssuedAt);
          expiresAt = dateOnly(request.renewalTerms.nextExpiresAt);
        } else if (request.type === CaseRequestType.STEWARDSHIP && done) {
          issuedAt = dateOnly(file.cardIssuedAt);
          expiresAt = dateOnly(file.cardExpiresAt);
        } else if (request.type === CaseRequestType.ISSUANCE && done) {
          if (firstRenewal?.renewalTerms) {
            issuedAt = dateOnly(firstRenewal.renewalTerms.currentIssuedAt);
            expiresAt = dateOnly(firstRenewal.renewalTerms.currentExpiresAt);
          } else {
            issuedAt = dateOnly(file.licenseIssuedAt);
            expiresAt = dateOnly(file.licenseExpiresAt);
          }
        }
        return {
          id: request.id,
          number: request.number,
          type: request.type,
          status: request.status,
          formationStep: request.formationStep,
          completedAt: request.completedAt?.toISOString() ?? null,
          createdAt: request.createdAt.toISOString(),
          issuedAt,
          expiresAt,
          auctionStartsAt,
          auctionEndsAt,
          intakeSubmittedAt: request.intakeSubmittedAt?.toISOString() ?? null,
          placesStatus: request.placesReview?.status ?? null,
        };
      }),
    };
  }

  async suspend(
    id: string,
    dto: SuspendCaseDto,
    actorId?: string,
    upload?: { buffer: Buffer; mimeType: string; originalName: string },
  ) {
    const file = await this.prisma.caseFile.findUnique({
      where: { id },
      select: { id: true, userId: true, formationStep: true, status: true },
    });
    if (!file || file.formationStep < 1)
      throw new NotFoundException('پرونده یافت نشد');
    if (file.status === CaseFileStatus.REVOKED) {
      throw new BadRequestException('روی پرونده ابطال‌شده تعلیق ثبت نمی‌شود');
    }
    const start = parseDate(dto.startsAt);
    const end = dto.endsAt ? parseDate(dto.endsAt) : null;
    if (!start || (dto.endsAt && !end)) {
      throw new BadRequestException('تاریخ تعلیق معتبر نیست');
    }
    if (end && end.getTime() < start.getTime()) {
      throw new BadRequestException(
        'تاریخ پایان باید همان روز شروع یا بعد از آن باشد',
      );
    }
    const today = parseDate(localTodayIso())!;
    let storageKey: string | null = null;
    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const row = await tx.caseSuspension.create({
          data: {
            caseFileId: id,
            reason: dto.reason,
            startsAt: start,
            endsAt: end,
            createdById: actorId ?? null,
          },
          select: { id: true, reason: true, startsAt: true, endsAt: true },
        });
        await this.attachSuspensionFile(tx, {
          personId: file.userId,
          caseFileId: id,
          suspensionId: row.id,
          kind: CaseSuspensionFileKind.SUSPEND,
          upload,
          track: (key) => {
            storageKey = key;
          },
        });
        const status =
          (await syncCaseStatus(tx, id, today)) ?? CaseFileStatus.ACTIVE;
        return { row, status };
      });
      return {
        id: created.row.id,
        reason: created.row.reason,
        startsAt: dateOnly(created.row.startsAt),
        endsAt: dateOnly(created.row.endsAt),
        active: suspensionIsActive(created.row, today),
        status: created.status,
      };
    } catch (error) {
      if (storageKey) await this.files.remove(storageKey);
      throw error;
    }
  }

  async liftSuspension(
    id: string,
    dto: LiftCaseSuspensionDto,
    upload?: { buffer: Buffer; mimeType: string; originalName: string },
  ) {
    const file = await this.prisma.caseFile.findUnique({
      where: { id },
      select: { id: true, userId: true, formationStep: true, status: true },
    });
    if (!file || file.formationStep < 1)
      throw new NotFoundException('پرونده یافت نشد');
    if (file.status === CaseFileStatus.REVOKED) {
      throw new BadRequestException(
        'روی پرونده ابطال‌شده تعلیق برداشته نمی‌شود',
      );
    }
    const end = parseDate(dto.endsAt);
    const today = parseDate(localTodayIso())!;
    if (!end) throw new BadRequestException('تاریخ پایان تعلیق معتبر نیست');
    if (end.getTime() > today.getTime()) {
      throw new BadRequestException(
        'تاریخ پایان تعلیق نمی‌تواند بعد از امروز باشد',
      );
    }
    let storageKey: string | null = null;
    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        const rows = await tx.caseSuspension.findMany({
          where: { caseFileId: id },
          orderBy: [
            { startsAt: 'desc' },
            { createdAt: 'desc' },
            { id: 'desc' },
          ],
          select: { id: true, startsAt: true, endsAt: true, liftedAt: true },
        });
        const current = rows.find((row) => suspensionIsActive(row, today));
        if (!current)
          throw new BadRequestException('این پرونده تعلیق نشده است');
        if (end.getTime() < current.startsAt.getTime()) {
          throw new BadRequestException(
            'تاریخ پایان باید همان روز شروع یا بعد از آن باشد',
          );
        }
        const row = await tx.caseSuspension.update({
          where: { id: current.id },
          data: { endsAt: end, liftNote: dto.note, liftedAt: new Date() },
          select: { id: true, startsAt: true, endsAt: true, liftNote: true },
        });
        await this.attachSuspensionFile(tx, {
          personId: file.userId,
          caseFileId: id,
          suspensionId: row.id,
          kind: CaseSuspensionFileKind.LIFT,
          upload,
          track: (key) => {
            storageKey = key;
          },
        });
        const status =
          (await syncCaseStatus(tx, id, today)) ?? CaseFileStatus.ACTIVE;
        return { ...row, status };
      });
      return {
        id: updated.id,
        startsAt: dateOnly(updated.startsAt),
        endsAt: dateOnly(updated.endsAt),
        liftNote: updated.liftNote,
        status: updated.status,
      };
    } catch (error) {
      if (storageKey) await this.files.remove(storageKey);
      throw error;
    }
  }

  async revoke(
    id: string,
    dto: RevokeCaseDto,
    actorId?: string,
    revokedAt = new Date(),
  ) {
    const file = await this.prisma.caseFile.findUnique({
      where: { id },
      select: { id: true, formationStep: true, status: true },
    });
    if (!file || file.formationStep < 1)
      throw new NotFoundException('پرونده یافت نشد');
    if (file.status === CaseFileStatus.REVOKED) {
      throw new BadRequestException('این پرونده قبلاً ابطال شده است');
    }
    await this.prisma.caseFile.update({
      where: { id },
      data: {
        status: CaseFileStatus.REVOKED,
        revokeReason: dto.reason,
        revokedAt,
        revokedById: actorId ?? null,
        reactivatedAt: null,
      },
    });
    await this.stewardship.revokeForLicense(id, dto.reason, actorId);
    return {
      status: CaseFileStatus.REVOKED,
      revokeReason: dto.reason,
      revokedAt: revokedAt.toISOString(),
    };
  }

  async reactivate(id: string) {
    const file = await this.prisma.caseFile.findUnique({
      where: { id },
      select: { id: true, formationStep: true, status: true },
    });
    if (!file || file.formationStep < 1)
      throw new NotFoundException('پرونده یافت نشد');
    if (file.status !== CaseFileStatus.REVOKED) {
      throw new BadRequestException('فقط پرونده ابطال‌شده دوباره فعال می‌شود');
    }
    const reactivatedAt = new Date();
    const today = parseDate(localTodayIso())!;
    const status = await this.prisma.$transaction(async (tx) => {
      await tx.caseSuspension.updateMany({
        where: {
          caseFileId: id,
          liftedAt: null,
          OR: [{ endsAt: null }, { endsAt: { gte: today } }],
        },
        data: { liftedAt: reactivatedAt },
      });
      await tx.caseFile.update({
        where: { id },
        data: { status: CaseFileStatus.ACTIVE, reactivatedAt },
      });
      return (await syncCaseStatus(tx, id, today)) ?? CaseFileStatus.ACTIVE;
    });
    return { status, reactivatedAt: reactivatedAt.toISOString() };
  }

  async readSuspensionFile(fileId: string) {
    const file = await this.prisma.caseSuspensionFile.findUnique({
      where: { id: fileId },
    });
    if (!file) throw new NotFoundException('پیوست یافت نشد');
    const data = await this.files.read(file.storageKey);
    return {
      mimeType: file.mimeType,
      byteSize: file.byteSize,
      originalName: file.originalName,
      data,
    };
  }

  private async attachSuspensionFile(
    tx: Prisma.TransactionClient,
    input: {
      personId: string;
      caseFileId: string;
      suspensionId: string;
      kind: CaseSuspensionFileKind;
      upload?: { buffer: Buffer; mimeType: string; originalName: string };
      track: (storageKey: string) => void;
    },
  ) {
    if (!input.upload?.buffer?.length) return;
    const fileId = randomUUID();
    const stored = await this.files.saveSuspension({
      personId: input.personId,
      caseFileId: input.caseFileId,
      suspensionId: input.suspensionId,
      fileId,
      buffer: input.upload.buffer,
      mimeType: input.upload.mimeType,
      originalName: input.upload.originalName,
    });
    input.track(stored.storageKey);
    await tx.caseSuspensionFile.create({
      data: {
        id: fileId,
        suspensionId: input.suspensionId,
        kind: input.kind,
        storageKey: stored.storageKey,
        originalName: stored.originalName,
        mimeType: stored.mimeType,
        byteSize: stored.byteSize,
      },
    });
  }

  async licenseDocument(id: string) {
    await syncIssuanceRequest(this.prisma, id, { createIfMissing: false });
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
        premiseAddressEn: true,
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
            gender: true,
            birthDate: true,
            passportNumber: true,
            photoId: true,
            country: { select: { iso2: true, nameFa: true, nameEn: true } },
          },
        },
      },
    });
    if (!file || file.formationStep < 1)
      throw new NotFoundException('پرونده یافت نشد');
    if (!file.licenseNumber) {
      return {
        licenseNumber: null,
        firstName: file.user.firstName,
        lastName: file.user.lastName,
        gender: file.user.gender,
      };
    }
    const stamp = await this.prisma.caseActivityLicenseSettings.findUnique({
      where: { id: 'default' },
      select: { signerName: true, signerTitle: true, signatureId: true },
    });
    return {
      licenseNumber: file.licenseNumber,
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
      tradeName: file.businessUnitTitle,
      activityTitle: file.activityJob?.title ?? null,
      activityTitleEn: file.activityJob?.titleEn ?? null,
      photoId: file.user.photoId,
      signerName: stamp?.signerName ?? null,
      signerTitle: stamp?.signerTitle ?? null,
      signatureId: stamp?.signatureId ?? null,
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

  async remove(id: string) {
    const file = await this.prisma.caseFile.findUnique({
      where: { id },
      select: { id: true, formationStep: true },
    });
    if (!file || file.formationStep < 1) {
      throw new NotFoundException('پرونده یافت نشد');
    }
    const dependents = await this.prisma.caseFile.findMany({
      where: { hostCaseFileId: file.id },
      select: { id: true },
    });
    const caseIds = [file.id, ...dependents.map((item) => item.id)];
    const storageKeys = await this.collectCaseStorageKeys(caseIds);
    await this.prisma.$transaction(async (tx) => {
      const payments = await tx.payment.findMany({
        where: {
          OR: [
            { caseFileId: { in: caseIds } },
            { caseRequest: { caseFileId: { in: caseIds } } },
          ],
        },
        select: {
          id: true,
          receipts: { select: { imageId: true } },
        },
      });
      if (payments.length) {
        await tx.payment.deleteMany({
          where: { id: { in: payments.map((item) => item.id) } },
        });
        const imageIds = payments.flatMap((item) =>
          item.receipts.map((receipt) => receipt.imageId),
        );
        if (imageIds.length) {
          await tx.storedImage.deleteMany({ where: { id: { in: imageIds } } });
        }
      }
      if (dependents.length) {
        await tx.caseFile.deleteMany({
          where: { id: { in: dependents.map((item) => item.id) } },
        });
      }
      await tx.caseFile.delete({ where: { id: file.id } });
    });
    await this.removeStorageIfUnused(storageKeys);
    return { ok: true };
  }

  private async collectCaseStorageKeys(caseIds: string[]) {
    const [
      activityFiles,
      suspensionFiles,
      stewardRevokeFiles,
      inquiryFiles,
      placesFiles,
      managementFiles,
    ] = await Promise.all([
      this.prisma.caseActivityDocumentVersion.findMany({
        where: { caseActivityDocument: { caseFileId: { in: caseIds } } },
        select: { storageKey: true },
      }),
      this.prisma.caseSuspensionFile.findMany({
        where: { suspension: { caseFileId: { in: caseIds } } },
        select: { storageKey: true },
      }),
      this.prisma.caseStewardRevokeFile.findMany({
        where: { caseFileId: { in: caseIds } },
        select: { storageKey: true },
      }),
      this.prisma.caseInquiryFile.findMany({
        where: { caseInquiry: { caseFileId: { in: caseIds } } },
        select: { storageKey: true },
      }),
      this.prisma.casePlacesFile.findMany({
        where: { review: { caseFileId: { in: caseIds } } },
        select: { storageKey: true },
      }),
      this.prisma.caseManagementReviewFile.findMany({
        where: { review: { caseFileId: { in: caseIds } } },
        select: { storageKey: true },
      }),
    ]);
    return [
      ...activityFiles.map((item) => item.storageKey),
      ...suspensionFiles.map((item) => item.storageKey),
      ...stewardRevokeFiles.map((item) => item.storageKey),
      ...inquiryFiles.map((item) => item.storageKey),
      ...placesFiles.map((item) => item.storageKey),
      ...managementFiles.map((item) => item.storageKey),
    ];
  }

  async documentCatalog() {
    return this.prisma.document.findMany({
      where: { NOT: { code: PERSONNEL_PHOTO_CODE } },
      orderBy: { title: 'asc' },
      select: { id: true, title: true },
    });
  }

  async documentTypes() {
    const rows = await this.prisma.caseIdentityDocument.findMany({
      where: { document: { NOT: { code: PERSONNEL_PHOTO_CODE } } },
      orderBy: { document: { title: 'asc' } },
      select: {
        gender: true,
        isRequired: true,
        document: {
          select: {
            id: true,
            code: true,
            title: true,
          },
        },
      },
    });
    return rows.map((row) => ({
      ...row.document,
      gender: row.gender,
      isRequired: row.isRequired,
    }));
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

  async identityDocumentBundle(userId: string) {
    await this.assertPerson(userId);
    const [types, stored] = await Promise.all([
      this.documentTypes(),
      this.personDocuments(userId),
    ]);
    return { types, stored };
  }

  async readPersonDocumentFile(userId: string, versionId: string) {
    await this.assertPerson(userId);
    const version = await this.prisma.personDocumentVersion.findUnique({
      where: { id: versionId },
      include: { personDocument: { select: { userId: true } } },
    });
    if (!version || version.personDocument.userId !== userId) {
      throw new NotFoundException('فایل مدرک یافت نشد');
    }
    const data = await this.files.read(version.storageKey);
    return {
      mimeType: version.mimeType,
      byteSize: version.byteSize,
      originalName: version.originalName,
      data,
    };
  }

  async activityRequirements(
    caseId: string,
    jobId?: string,
    requestType?: string,
    requestId?: string,
  ) {
    const file = await this.prisma.caseFile.findUnique({
      where: { id: caseId },
      select: {
        id: true,
        activityJobId: true,
        user: { select: { gender: true } },
      },
    });
    if (!file) throw new NotFoundException('پرونده یافت نشد');
    const explicit =
      requestType && isProcessType(requestType) ? requestType : null;
    const request = explicit
      ? null
      : await requestOnCase(this.prisma, caseId, requestId);
    const type =
      explicit ??
      (request && isProcessType(request.type)
        ? request.type
        : CaseRequestType.ISSUANCE);
    return resolveDocumentRequirements(
      this.prisma,
      type,
      jobId || file.activityJobId,
      file.user.gender,
    );
  }

  async activityDocuments(caseId: string, requestId?: string) {
    const file = await this.prisma.caseFile.findUnique({
      where: { id: caseId },
      select: { id: true },
    });
    if (!file) throw new NotFoundException('پرونده یافت نشد');
    const request = await requestOnCase(this.prisma, caseId, requestId);
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
    requestId?: string;
    jobId?: string;
    editCaseId?: string;
    other?: boolean;
    actorId?: string;
    buffer: Buffer;
    mimeType: string;
    originalName: string;
  }) {
    await this.assertPerson(input.userId);
    const document = await this.prisma.document.findUnique({
      where: { id: input.documentId },
      select: { id: true, code: true },
    });
    if (!document) throw new NotFoundException('مدرک یافت نشد');
    if (input.caseId) {
      if (document.code === PERSONNEL_PHOTO_CODE) {
        throw new BadRequestException('عکس پرسنلی روی مشخصات شخص ذخیره می‌شود');
      }
      return this.uploadActivityDocument(input, document);
    }
    if (input.jobId) {
      throw new BadRequestException('مدرک شغلی باید روی پرونده ذخیره شود');
    }
    if (document.code === PERSONNEL_PHOTO_CODE) {
      throw new BadRequestException('عکس پرسنلی روی مشخصات شخص ذخیره می‌شود');
    }
    await this.assertPersonIdentityEditable(input.userId, input.actorId);
    const linked = await this.prisma.caseIdentityDocument.findUnique({
      where: { documentId: document.id },
      select: { documentId: true },
    });
    if (!linked && !input.other) {
      throw new NotFoundException('این مدرک در فهرست مدارک اطلاعات هویتی نیست');
    }

    const personDocument = await this.prisma.personDocument.upsert({
      where: {
        userId_documentId: { userId: input.userId, documentId: document.id },
      },
      create: { userId: input.userId, documentId: document.id },
      update: {},
      select: {
        id: true,
        versions: {
          select: { version: true },
          orderBy: { version: 'desc' },
          take: 1,
        },
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
      requestId?: string;
      jobId?: string;
      other?: boolean;
      actorId?: string;
      buffer: Buffer;
      mimeType: string;
      originalName: string;
    },
    document: { id: string },
  ) {
    if (!input.caseId)
      throw new BadRequestException('مدرک شغلی باید روی پرونده ذخیره شود');
    const caseFile = await this.prisma.caseFile.findUnique({
      where: { id: input.caseId },
      select: {
        id: true,
        userId: true,
        activityJobId: true,
        licenseNumber: true,
        user: { select: { gender: true } },
      },
    });
    if (!caseFile || caseFile.userId !== input.userId) {
      throw new NotFoundException('پرونده یافت نشد');
    }
    if (!input.requestId && caseFile.licenseNumber) {
      if (!input.actorId) throw new UnauthorizedException();
      await this.assertIssuedCaseEditable(
        caseFile.licenseNumber,
        input.actorId,
      );
    }
    const jobId = input.jobId || caseFile.activityJobId;
    if (!jobId)
      throw new BadRequestException('قبل از بارگذاری مدرک باید شغل انتخاب شود');
    const request = await requestOnCase(
      this.prisma,
      caseFile.id,
      input.requestId,
    );
    if (!request || !isProcessType(request.type)) {
      throw new BadRequestException('درخواست بازی برای این مدرک نیست');
    }
    await assertRequestMutable(this.prisma, request.id, input.actorId);
    const allowed = await this.isActivityDocument(
      document,
      jobId,
      request.type,
      caseFile.user.gender,
    );
    if (!allowed && !input.other) {
      throw new NotFoundException('این مدرک برای شغل انتخاب‌شده نیست');
    }
    const activityDocument = await this.prisma.caseActivityDocument.upsert({
      where: {
        caseRequestId_documentId: {
          caseRequestId: request.id,
          documentId: document.id,
        },
      },
      create: {
        caseFileId: caseFile.id,
        caseRequestId: request.id,
        documentId: document.id,
      },
      update: {},
      select: {
        id: true,
        versions: {
          select: { version: true },
          orderBy: { version: 'desc' },
          take: 1,
        },
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
    await this.resumePlacesAfterDocuments(caseFile.id);
    return { documentId: document.id, current: created };
  }

  /** اگر استعلام‌ها تمام شده باشند و مدرکِ جاافتاده حالا آمده باشد، پرونده به اماکن می‌رود. */
  private async resumePlacesAfterDocuments(caseFileId: string) {
    const inquiry = await this.prisma.caseInquiry.findFirst({
      where: { caseFileId, status: { not: CaseInquiryStatus.PENDING } },
      select: { id: true },
    });
    if (!inquiry) return;
    try {
      await this.advanceToPlacesAfterInquiry(inquiry.id);
    } catch (error) {
      if (!(error instanceof BadRequestException)) throw error;
    }
  }

  async removeDocument(
    userId: string,
    documentId: string,
    guard?: { editCaseId?: string; actorId?: string },
  ) {
    await this.assertPerson(userId);
    await this.assertPersonIdentityEditable(userId, guard?.actorId);
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
    await this.removeStorageIfUnused(
      row.versions.map((version) => version.storageKey),
    );
    return { ok: true };
  }

  async removeActivityDocument(
    caseId: string,
    documentId: string,
    requestId?: string,
    actorId?: string,
  ) {
    const file = await this.prisma.caseFile.findUnique({
      where: { id: caseId },
      select: { id: true, licenseNumber: true },
    });
    if (!file) throw new NotFoundException('پرونده یافت نشد');
    if (!requestId && file.licenseNumber) {
      if (!actorId) throw new UnauthorizedException();
      await this.assertIssuedCaseEditable(file.licenseNumber, actorId);
    }
    const request = await requestOnCase(this.prisma, caseId, requestId);
    if (!request) throw new NotFoundException('مدرک بارگذاری‌شده‌ای یافت نشد');
    await assertRequestMutable(this.prisma, request.id, actorId);
    const row = await this.prisma.caseActivityDocument.findUnique({
      where: {
        caseRequestId_documentId: { caseRequestId: request.id, documentId },
      },
      select: {
        id: true,
        versions: { select: { storageKey: true } },
      },
    });
    if (!row || row.versions.length === 0) {
      throw new NotFoundException('مدرک بارگذاری‌شده‌ای یافت نشد');
    }
    await this.prisma.caseActivityDocument.delete({ where: { id: row.id } });
    await this.removeStorageIfUnused(
      row.versions.map((version) => version.storageKey),
    );
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
    return (
      gender === DocumentGender.BOTH || !personGender || gender === personGender
    );
  }

  private async isActivityDocument(
    document: { id: string },
    jobId: string,
    requestType: CaseRequestType,
    gender: 'MALE' | 'FEMALE' | null,
  ) {
    const rows = await resolveDocumentRequirements(
      this.prisma,
      requestType,
      jobId,
      gender,
    );
    return rows.some((row) => row.id === document.id);
  }

  private async processHasNoRequiredDocuments(caseId: string) {
    const request = await findOpenRequest(this.prisma, caseId);
    if (!request || !isProcessType(request.type)) return false;
    const file = await this.prisma.caseFile.findUnique({
      where: { id: caseId },
      select: { activityJobId: true, user: { select: { gender: true } } },
    });
    const docs = await resolveDocumentRequirements(
      this.prisma,
      request.type,
      file?.activityJobId ?? null,
      file?.user.gender ?? null,
    );
    return !docs.some((row) => row.isRequired);
  }

  private async assertActivityDocumentsDelivered(
    caseFileId: string,
    requestId?: string,
  ) {
    const file = await this.prisma.caseFile.findUnique({
      where: { id: caseFileId },
      select: { activityJobId: true, user: { select: { gender: true } } },
    });
    if (!file?.activityJobId) {
      throw new BadRequestException(
        'قبل از مرحله اماکن باید شغل و مدارک آن تکمیل شود',
      );
    }
    const request = await requestOnCase(this.prisma, caseFileId, requestId);
    if (!request || !isProcessType(request.type)) {
      throw new BadRequestException(
        'قبل از مرحله اماکن باید شغل و مدارک آن تکمیل شود',
      );
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
      stored
        .filter((row) => row.versions.length > 0)
        .map((row) => row.documentId),
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
        this.prisma.caseActivityDocumentVersion.count({
          where: { storageKey },
        }),
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
