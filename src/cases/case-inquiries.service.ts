import { randomUUID } from 'crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  containsInsensitive,
  normalizeSearchDigits,
  paginatedResult,
  paginationArgs,
  wantsPagination,
} from '../common/pagination';
import { resolveSortOrder } from '../common/sort-query';
import {
  CaseInquiryChannel,
  CaseInquiryStatus,
  DocumentGender,
  Prisma,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FindCaseInquiriesQueryDto } from './dto/find-case-inquiries-query.dto';
import { INQUIRIES_FORMATION_STEP, rewindFormationStep } from './formation-steps';
import { PersonFileStorage } from './person-file.storage';

const inquiryInclude = {
  inquiryCenter: {
    select: {
      id: true,
      name: true,
      phone: true,
      officerId: true,
      officer: { select: { fullName: true } },
    },
  },
  decidedBy: { select: { id: true, fullName: true } },
  files: {
    orderBy: { createdAt: 'desc' as const },
    select: {
      id: true,
      originalName: true,
      mimeType: true,
      byteSize: true,
      createdAt: true,
    },
  },
} satisfies Prisma.CaseInquiryInclude;

type InquiryRecord = Prisma.CaseInquiryGetPayload<{ include: typeof inquiryInclude }>;

const DEFAULT_LETTER_BODY = [
  'با سلام',
  'خواهشمند است نسبت به استعلام {{fullName}} به شماره ملی {{nationalId}} با کد پیگیری {{trackingCode}} برای شغل {{jobTitle}} ({{unitTitle}}) اعلام نظر فرمایید.',
  'نشانی: {{address}}',
  'تلفن: {{phone}}',
].join('\n');

export type InquiryActor = {
  id: string;
  isAdmin?: boolean;
  formation?: boolean;
};

function dateOnly(value: Date | null) {
  return value ? value.toISOString().slice(0, 10) : null;
}

function mapInquiry(row: InquiryRecord) {
  return {
    id: row.id,
    status: row.status,
    channel: row.channel,
    note: row.note,
    createdAt: row.createdAt,
    decidedAt: row.decidedAt,
    decidedBy: row.decidedBy,
    center: {
      id: row.inquiryCenter.id,
      name: row.inquiryCenter.name,
      phone: row.inquiryCenter.phone,
      officerName: row.inquiryCenter.officer?.fullName ?? null,
    },
    files: row.files,
  };
}

@Injectable()
export class CaseInquiriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly files: PersonFileStorage,
  ) {}

  async ensureForUser(caseFileId: string) {
    const file = await this.prisma.caseFile.findUnique({
      where: { id: caseFileId },
      select: { id: true, activityJobId: true },
    });
    if (!file?.activityJobId) return;
    const links = await this.prisma.jobInquiryCenter.findMany({
      where: { jobId: file.activityJobId, inquiryCenter: { isActive: true } },
      select: { inquiryCenterId: true },
    });
    if (!links.length) return;
    await this.prisma.caseInquiry.createMany({
      data: links.map((link) => ({
        caseFileId: file.id,
        inquiryCenterId: link.inquiryCenterId,
      })),
      skipDuplicates: true,
    });
  }

  async assertDelivered(caseFileId: string) {
    await this.ensureForUser(caseFileId);
    const pending = await this.prisma.caseInquiry.count({
      where: { caseFileId, status: CaseInquiryStatus.PENDING },
    });
    if (pending > 0) {
      throw new BadRequestException('قبل از مرحله اماکن باید نتیجه همه استعلام‌ها ثبت شود');
    }
  }

  async listForCase(caseFileId: string) {
    await this.ensureForUser(caseFileId);
    const rows = await this.prisma.caseInquiry.findMany({
      where: { caseFileId },
      include: inquiryInclude,
      orderBy: [{ inquiryCenter: { name: 'asc' } }, { id: 'asc' }],
    });
    return rows.map(mapInquiry);
  }

  async letter(id: string, actor: InquiryActor) {
    const row = await this.findReadable(id, actor);
    const person = await this.letterSubject(row.caseFileId);
    if (!person) throw new NotFoundException('شخص یافت نشد');
    const fields = {
      fullName: person.fullName,
      nationalId: person.nationalId ?? '',
      trackingCode: person.caseTrackingCode ?? '',
      jobTitle: person.activityJob?.title ?? '',
      unitTitle: person.businessUnitTitle ?? '',
      address: person.premiseAddress ?? '',
      phone: person.phone ?? '',
      date: new Date().toISOString().slice(0, 10),
      centerName: row.inquiryCenter.name,
    };
    const center = await this.prisma.inquiryCenter.findUnique({
      where: { id: row.inquiryCenterId },
      select: { letterTitle: true, letterBody: true, name: true, phone: true },
    });
    return {
      id: row.id,
      centerName: center?.name ?? row.inquiryCenter.name,
      centerPhone: center?.phone ?? null,
      nationalId: person.nationalId,
      letterTitle: center?.letterTitle?.trim() || `استعلام ${fields.centerName}`,
      letterBody: center?.letterBody?.trim() || DEFAULT_LETTER_BODY,
      fields,
    };
  }

  async decide(
    id: string,
    actor: InquiryActor,
    input: {
      status: string;
      note?: string | null;
      channel: CaseInquiryChannel;
      file?: { buffer: Buffer; mimeType: string; originalName: string };
    },
  ) {
    const row = await this.findReadable(id, actor);
    if (input.channel === CaseInquiryChannel.SYSTEM && !actor.isAdmin && row.inquiryCenter.officerId !== actor.id) {
      throw new ForbiddenException('این استعلام برای مرکز شما نیست');
    }
    if (row.status !== CaseInquiryStatus.PENDING) {
      throw new BadRequestException('نتیجه این استعلام قبلاً ثبت شده است');
    }
    if (input.status !== CaseInquiryStatus.APPROVED && input.status !== CaseInquiryStatus.REJECTED) {
      throw new BadRequestException('نتیجه استعلام معتبر نیست');
    }
    const note = input.note?.trim() || null;
    if (input.status === CaseInquiryStatus.REJECTED && !note) {
      throw new BadRequestException('برای رد استعلام توضیحات لازم است');
    }
    if (input.file?.buffer?.length) {
      const fileId = randomUUID();
      const stored = await this.files.saveInquiry({
        personId: (await this.ownerId(row.caseFileId)) ?? row.caseFileId,
        inquiryId: row.id,
        fileId,
        buffer: input.file.buffer,
        mimeType: input.file.mimeType,
        originalName: input.file.originalName,
      });
      await this.prisma.caseInquiryFile.create({
        data: {
          id: fileId,
          caseInquiryId: row.id,
          storageKey: stored.storageKey,
          originalName: stored.originalName,
          mimeType: stored.mimeType,
          byteSize: stored.byteSize,
          uploadedById: actor.id,
        },
      });
    }
    const saved = await this.prisma.caseInquiry.update({
      where: { id: row.id },
      data: {
        status: input.status,
        channel: input.channel,
        note,
        decidedById: actor.id,
        decidedAt: new Date(),
      },
      include: inquiryInclude,
    });
    return mapInquiry(saved);
  }

  async reopen(id: string) {
    const row = await this.prisma.caseInquiry.findUnique({ where: { id }, include: inquiryInclude });
    if (!row) throw new NotFoundException('استعلام یافت نشد');
    const saved = await this.prisma.caseInquiry.update({
      where: { id },
      data: {
        status: CaseInquiryStatus.PENDING,
        channel: null,
        note: null,
        decidedById: null,
        decidedAt: null,
      },
      include: inquiryInclude,
    });
    await rewindFormationStep(this.prisma, saved.caseFileId, INQUIRIES_FORMATION_STEP);
    return mapInquiry(saved);
  }

  async inbox(actor: InquiryActor, query: FindCaseInquiriesQueryDto) {
    const q = query.q?.trim();
    const digits = q ? normalizeSearchDigits(q) : '';
    const where: Prisma.CaseInquiryWhereInput = {
      status: query.status,
      ...(actor.isAdmin ? {} : { inquiryCenter: { officerId: actor.id } }),
      OR: q
        ? [
            { caseFile: { user: { fullName: containsInsensitive(q) } } },
            { caseFile: { businessUnitTitle: containsInsensitive(q) } },
            { inquiryCenter: { name: containsInsensitive(q) } },
            { caseFile: { activityJob: { title: containsInsensitive(q) } } },
            ...(digits
              ? [
                  { caseFile: { user: { nationalId: { contains: digits } } } },
                  { caseFile: { trackingCode: { contains: digits } } },
                ]
              : []),
          ]
        : undefined,
    };
    const orderBy = resolveSortOrder<Prisma.CaseInquiryOrderByWithRelationInput>(
      query.sortBy,
      query.sortDir,
      {
        applicant: (dir) => ({ caseFile: { user: { fullName: dir } } }),
        nationalId: (dir) => ({ caseFile: { user: { nationalId: dir } } }),
        center: (dir) => ({ inquiryCenter: { name: dir } }),
        job: (dir) => ({ caseFile: { activityJob: { title: dir } } }),
        status: (dir) => ({ status: dir }),
        createdAt: (dir) => ({ createdAt: dir }),
        decidedAt: (dir) => ({ decidedAt: dir }),
      },
      [{ createdAt: 'desc' }, { id: 'asc' }],
    );
    const select = {
      id: true,
      status: true,
      channel: true,
      createdAt: true,
      decidedAt: true,
      inquiryCenter: { select: { id: true, name: true } },
      caseFile: {
        select: {
          id: true,
          trackingCode: true,
          businessUnitTitle: true,
          activityJob: { select: { title: true } },
          user: { select: { fullName: true, nationalId: true } },
        },
      },
    } satisfies Prisma.CaseInquirySelect;

    const mapRow = (row: Prisma.CaseInquiryGetPayload<{ select: typeof select }>) => ({
      id: row.id,
      status: row.status,
      channel: row.channel,
      createdAt: row.createdAt,
      decidedAt: row.decidedAt,
      centerName: row.inquiryCenter.name,
      applicantName: row.caseFile.user.fullName,
      nationalId: row.caseFile.user.nationalId,
      trackingCode: row.caseFile.trackingCode,
      unitTitle: row.caseFile.businessUnitTitle,
      jobTitle: row.caseFile.activityJob?.title ?? null,
    });

    if (!wantsPagination(query)) {
      const items = await this.prisma.caseInquiry.findMany({ where, orderBy, select });
      return items.map(mapRow);
    }
    const { page, pageSize, skip, take } = paginationArgs(query);
    const [items, total, assignedCenters] = await Promise.all([
      this.prisma.caseInquiry.findMany({ where, orderBy, skip, take, select }),
      this.prisma.caseInquiry.count({ where }),
      this.actorCenters(actor),
    ]);
    return {
      ...paginatedResult(items.map(mapRow), total, page, pageSize),
      centers: assignedCenters,
    };
  }

  async summary(actor: InquiryActor) {
    const where: Prisma.CaseInquiryWhereInput = actor.isAdmin
      ? {}
      : { inquiryCenter: { officerId: actor.id } };
    const [rows, centers] = await Promise.all([
      this.prisma.caseInquiry.groupBy({
        by: ['caseFileId', 'status'],
        where,
        _count: { _all: true },
      }),
      this.prisma.inquiryCenter.findMany({
        where: { officerId: actor.id },
        select: { id: true, name: true },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
      }),
    ]);
    const pendingUsers = new Set<string>();
    const users = new Set<string>();
    for (const row of rows) {
      users.add(row.caseFileId);
      if (row.status === CaseInquiryStatus.PENDING) pendingUsers.add(row.caseFileId);
    }
    const total = users.size;
    const pending = pendingUsers.size;
    return {
      total,
      pending,
      reviewed: total - pending,
      centers,
    };
  }

  private async actorCenters(actor: InquiryActor) {
    const assigned = await this.prisma.inquiryCenter.findMany({
      where: { officerId: actor.id },
      select: { id: true, name: true },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
    if (assigned.length > 0 || !actor.isAdmin) return assigned;
    return this.prisma.inquiryCenter.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
  }

  async dossier(id: string, actor: InquiryActor) {
    const inquiry = await this.findReadable(id, actor);
    return this.personDossier(inquiry.caseFileId);
  }

  async personDossier(caseFileId: string) {
    const dossier = await this.prisma.caseFile.findUnique({
      where: { id: caseFileId },
      select: {
        businessUnitTitle: true,
        premiseAddress: true,
        premiseAddressEn: true,
        premisePlaque: true,
        premisePlaqueSeries: true,
        premiseFloor: true,
        premiseUnitNo: true,
        premisePostalCode: true,
        premisePhone: true,
        premiseFax: true,
        premiseEstablishment: true,
        premiseGeoPosition: true,
        premisePublicAccess: true,
        premiseOwnership: true,
        premiseDeedNo: true,
        premiseArea: true,
        leaseIssuedAt: true,
        leaseExpiresAt: true,
        leaseAgency: true,
        premiseOwnerName: true,
        activityJob: {
          select: {
            title: true,
            documents: {
              select: {
                isRequired: true,
                gender: true,
                document: { select: { id: true, title: true } },
              },
            },
          },
        },
        premiseCity: {
          select: {
            nameFa: true,
            nameEn: true,
            province: { select: { nameFa: true, nameEn: true } },
          },
        },
        premiseComplex: { select: { name: true, nameEn: true } },
        registrationPlace: { select: { title: true } },
        user: {
          select: {
            id: true,
            gender: true,
            firstName: true,
            lastName: true,
            fatherName: true,
            lastNameEn: true,
            religion: true,
            religionOther: true,
            nationalId: true,
            birthDate: true,
            birthPlace: true,
            identityCertificateNo: true,
            identityIssuedIn: true,
            residencyStatus: true,
            passportNumber: true,
            nationalCardExpiresAt: true,
            passportExpiresAt: true,
            phone: true,
            homePhone: true,
            postalCode: true,
            email: true,
            address: true,
            educationLevel: true,
            citizenGroup: true,
            country: { select: { nameFa: true, nameEn: true } },
            economicJob: { select: { title: true } },
          },
        },
      },
    });
    if (!dossier) throw new NotFoundException('پرونده یافت نشد');
    const user = {
      ...dossier.user,
      businessUnitTitle: dossier.businessUnitTitle,
      premiseAddress: dossier.premiseAddress,
      premiseAddressEn: dossier.premiseAddressEn,
      premisePlaque: dossier.premisePlaque,
      premisePlaqueSeries: dossier.premisePlaqueSeries,
      premiseFloor: dossier.premiseFloor,
      premiseUnitNo: dossier.premiseUnitNo,
      premisePostalCode: dossier.premisePostalCode,
      premisePhone: dossier.premisePhone,
      premiseFax: dossier.premiseFax,
      premiseEstablishment: dossier.premiseEstablishment,
      premiseGeoPosition: dossier.premiseGeoPosition,
      premisePublicAccess: dossier.premisePublicAccess,
      premiseOwnership: dossier.premiseOwnership,
      premiseDeedNo: dossier.premiseDeedNo,
      premiseArea: dossier.premiseArea,
      leaseIssuedAt: dossier.leaseIssuedAt,
      leaseExpiresAt: dossier.leaseExpiresAt,
      leaseAgency: dossier.leaseAgency,
      premiseOwnerName: dossier.premiseOwnerName,
      activityJob: dossier.activityJob,
      premiseCity: dossier.premiseCity,
      premiseComplex: dossier.premiseComplex,
      registrationPlace: dossier.registrationPlace,
    };

    const [fixedDocs, stored] = await Promise.all([
      this.prisma.document.findMany({
        where: { isFixed: true, isRequired: true },
        select: { id: true, title: true, gender: true },
        orderBy: { title: 'asc' },
      }),
      this.prisma.caseActivityDocument.findMany({
        where: { caseFileId },
        select: {
          documentId: true,
          versions: {
            orderBy: { version: 'desc' },
            take: 1,
            select: { id: true, originalName: true, mimeType: true },
          },
        },
      }),
    ]);

    const currentFile = (documentId: string) => {
      const version = stored.find((row) => row.documentId === documentId)?.versions[0];
      if (!version) return null;
      return {
        id: version.id,
        originalName: version.originalName,
        mimeType: version.mimeType,
      };
    };
    const seen = new Set<string>();
    const documents: {
      id: string;
      title: string;
      group: 'FIXED' | 'JOB';
      isRequired: boolean;
      file: { id: string; originalName: string | null; mimeType: string } | null;
    }[] = [];
    let fixedTotal = 0;
    let jobTotal = 0;
    for (const doc of fixedDocs) {
      if (!this.matchesDocumentGender(doc.gender, user.gender)) continue;
      fixedTotal += 1;
      seen.add(doc.id);
      documents.push({
        id: doc.id,
        title: doc.title,
        group: 'FIXED',
        isRequired: true,
        file: currentFile(doc.id),
      });
    }
    for (const link of user.activityJob?.documents ?? []) {
      if (!this.matchesDocumentGender(link.gender, user.gender)) continue;
      jobTotal += 1;
      if (seen.has(link.document.id)) continue;
      seen.add(link.document.id);
      documents.push({
        id: link.document.id,
        title: link.document.title,
        group: 'JOB',
        isRequired: link.isRequired,
        file: currentFile(link.document.id),
      });
    }
    documents.sort((left, right) => {
      if (left.group !== right.group) return left.group === 'FIXED' ? -1 : 1;
      return left.title.localeCompare(right.title, 'fa');
    });
    const uploaded = documents.filter((item) => item.file).length;
    const remaining = documents.filter((item) => item.isRequired && !item.file).length;

    return {
      person: {
        firstName: user.firstName,
        lastName: user.lastName,
        fatherName: user.fatherName,
        lastNameEn: user.lastNameEn,
        gender: user.gender,
        religion: user.religion,
        religionOther: user.religionOther,
        nationalId: user.nationalId,
        birthDate: dateOnly(user.birthDate),
        birthPlace: user.birthPlace,
        identityCertificateNo: user.identityCertificateNo,
        identityIssuedIn: user.identityIssuedIn,
        country: user.country,
        residencyStatus: user.residencyStatus,
        passportNumber: user.passportNumber,
        nationalCardExpiresAt: dateOnly(user.nationalCardExpiresAt),
        passportExpiresAt: dateOnly(user.passportExpiresAt),
        phone: user.phone,
        homePhone: user.homePhone,
        postalCode: user.postalCode,
        email: user.email,
        address: user.address,
        educationLevel: user.educationLevel,
        citizenGroup: user.citizenGroup,
        jobTitle: user.economicJob?.title ?? null,
        activityJobTitle: user.activityJob?.title ?? null,
        unitTitle: user.businessUnitTitle,
      },
      documents,
      documentStats: { fixedTotal, jobTotal, uploaded, remaining },
      location: {
        city: user.premiseCity
          ? { nameFa: user.premiseCity.nameFa, nameEn: user.premiseCity.nameEn }
          : null,
        province: user.premiseCity?.province ?? null,
        complex: user.premiseComplex,
        establishment: user.premiseEstablishment,
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
        registrationPlace: user.registrationPlace?.title ?? null,
        ownership: user.premiseOwnership,
        deedNo: user.premiseDeedNo,
        area: user.premiseArea == null ? null : user.premiseArea.toString(),
        leaseIssuedAt: dateOnly(user.leaseIssuedAt),
        leaseExpiresAt: dateOnly(user.leaseExpiresAt),
        leaseAgency: user.leaseAgency,
        ownerName: user.premiseOwnerName,
      },
    };
  }

  async readDossierFile(inquiryId: string, versionId: string, actor: InquiryActor) {
    const inquiry = await this.findReadable(inquiryId, actor);
    const userId = await this.ownerId(inquiry.caseFileId);
    if (!userId) throw new NotFoundException('شخص یافت نشد');
    return this.readPersonDocument(userId, versionId);
  }

  async readPersonDocument(userId: string, versionId: string) {
    const version = await this.prisma.personDocumentVersion.findUnique({
      where: { id: versionId },
      include: { personDocument: { select: { userId: true } } },
    });
    if (version?.personDocument.userId === userId) {
      const data = await this.files.read(version.storageKey);
      return {
        mimeType: version.mimeType,
        byteSize: version.byteSize,
        originalName: version.originalName,
        data,
      };
    }
    const activity = await this.prisma.caseActivityDocumentVersion.findUnique({
      where: { id: versionId },
      include: { caseActivityDocument: { select: { caseFile: { select: { userId: true } } } } },
    });
    if (!activity || activity.caseActivityDocument.caseFile.userId !== userId) {
      throw new NotFoundException('فایل مدرک یافت نشد');
    }
    const data = await this.files.read(activity.storageKey);
    return {
      mimeType: activity.mimeType,
      byteSize: activity.byteSize,
      originalName: activity.originalName,
      data,
    };
  }

  async detail(id: string, actor: InquiryActor) {
    const row = await this.findReadable(id, actor);
    const person = await this.letterSubject(row.caseFileId);
    return {
      ...mapInquiry(row),
      applicant: person
        ? {
            fullName: person.fullName,
            gender: person.gender,
            nationalId: person.nationalId,
            trackingCode: person.caseTrackingCode,
            phone: person.phone,
            unitTitle: person.businessUnitTitle,
            jobTitle: person.activityJob?.title ?? null,
          }
        : null,
    };
  }

  async readFile(fileId: string, actor: InquiryActor) {
    const file = await this.prisma.caseInquiryFile.findUnique({
      where: { id: fileId },
      include: { caseInquiry: { include: inquiryInclude } },
    });
    if (!file) throw new NotFoundException('پیوست استعلام یافت نشد');
    this.assertReadable(file.caseInquiry, actor);
    const data = await this.files.read(file.storageKey);
    return {
      mimeType: file.mimeType,
      byteSize: file.byteSize,
      originalName: file.originalName,
      data,
    };
  }

  private async ownerId(caseFileId: string) {
    const row = await this.prisma.caseFile.findUnique({
      where: { id: caseFileId },
      select: { userId: true },
    });
    return row?.userId ?? null;
  }

  private async letterSubject(caseFileId: string) {
    const row = await this.prisma.caseFile.findUnique({
      where: { id: caseFileId },
      select: {
        trackingCode: true,
        businessUnitTitle: true,
        premiseAddress: true,
        activityJob: { select: { title: true } },
        user: { select: { fullName: true, nationalId: true, phone: true, gender: true } },
      },
    });
    if (!row) return null;
    return {
      fullName: row.user.fullName,
      gender: row.user.gender,
      nationalId: row.user.nationalId,
      phone: row.user.phone,
      caseTrackingCode: row.trackingCode,
      businessUnitTitle: row.businessUnitTitle,
      premiseAddress: row.premiseAddress,
      activityJob: row.activityJob,
    };
  }

  private async findReadable(id: string, actor: InquiryActor) {
    const row = await this.prisma.caseInquiry.findUnique({ where: { id }, include: inquiryInclude });
    if (!row) throw new NotFoundException('استعلام یافت نشد');
    this.assertReadable(row, actor);
    return row;
  }

  private matchesDocumentGender(
    gender: DocumentGender,
    personGender: 'MALE' | 'FEMALE' | null,
  ) {
    return gender === DocumentGender.BOTH || !personGender || gender === personGender;
  }

  private assertReadable(row: InquiryRecord, actor: InquiryActor) {
    if (actor.isAdmin || actor.formation) return;
    if (row.inquiryCenter.officerId === actor.id) return;
    throw new ForbiddenException('این استعلام برای مرکز شما نیست');
  }
}
