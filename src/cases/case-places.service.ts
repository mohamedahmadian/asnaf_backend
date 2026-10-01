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
  Prisma,
  UserStatus,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CaseInquiriesService, type InquiryActor } from './case-inquiries.service';
import { FindCaseInquiriesQueryDto } from './dto/find-case-inquiries-query.dto';
import { SaveCasePlacesOfficeDto } from './dto/save-case-places-office.dto';
import { PersonFileStorage } from './person-file.storage';

const PLACES_NAME = 'اداره اماکن';
const OFFICE_ID = 'default';

const DEFAULT_LETTER_BODY = [
  'با سلام',
  'خواهشمند است نسبت به {{fullName}} به شماره ملی {{nationalId}} با کد پیگیری {{trackingCode}} برای شغل {{jobTitle}} ({{unitTitle}}) اعلام نظر فرمایید.',
  'نشانی: {{address}}',
  'تلفن: {{phone}}',
].join('\n');

const reviewInclude = {
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
} satisfies Prisma.CasePlacesReviewInclude;

type ReviewRecord = Prisma.CasePlacesReviewGetPayload<{ include: typeof reviewInclude }>;

@Injectable()
export class CasePlacesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly files: PersonFileStorage,
    private readonly inquiries: CaseInquiriesService,
  ) {}

  async office() {
    const row = await this.ensureOffice();
    return {
      id: row.id,
      phone: row.phone,
      officerId: row.officerId,
      officerName: row.officer?.fullName ?? null,
      letterTitle: row.letterTitle,
      letterBody: row.letterBody,
    };
  }

  async officerOptions() {
    return this.prisma.user.findMany({
      where: { status: UserStatus.ACTIVE },
      select: { id: true, fullName: true },
      orderBy: [{ fullName: 'asc' }, { id: 'asc' }],
    });
  }

  async saveOffice(dto: SaveCasePlacesOfficeDto) {
    if (dto.officerId) {
      const officer = await this.prisma.user.findUnique({
        where: { id: dto.officerId },
        select: { id: true },
      });
      if (!officer) throw new NotFoundException('مسئول مربوطه یافت نشد');
    }
    const phone = dto.phone?.replace(/\D/g, '') || null;
    await this.prisma.casePlacesOffice.upsert({
      where: { id: OFFICE_ID },
      create: {
        id: OFFICE_ID,
        phone,
        officerId: dto.officerId ?? null,
        letterTitle: dto.letterTitle?.trim() || null,
        letterBody: dto.letterBody?.trim() || null,
      },
      update: {
        phone,
        officerId: dto.officerId ?? null,
        letterTitle: dto.letterTitle?.trim() || null,
        letterBody: dto.letterBody?.trim() || null,
      },
    });
    return this.office();
  }

  async ensureForUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) return null;
    return this.prisma.casePlacesReview.upsert({
      where: { userId },
      create: { userId },
      update: {},
      include: reviewInclude,
    });
  }

  async assertDelivered(userId: string) {
    const row = await this.prisma.casePlacesReview.findUnique({
      where: { userId },
      select: { status: true },
    });
    if (!row || row.status === CaseInquiryStatus.PENDING) {
      throw new BadRequestException('قبل از تاییدهای مدیریتی باید نظر اداره اماکن ثبت شود');
    }
  }

  async listForCase(userId: string) {
    const row = await this.ensureForUser(userId);
    if (!row) return null;
    return this.mapReview(row);
  }

  async letter(id: string, actor: InquiryActor) {
    const row = await this.findReadable(id, actor);
    const person = await this.prisma.user.findUnique({
      where: { id: row.userId },
      select: {
        fullName: true,
        nationalId: true,
        caseTrackingCode: true,
        phone: true,
        businessUnitTitle: true,
        premiseAddress: true,
        activityJob: { select: { title: true } },
      },
    });
    if (!person) throw new NotFoundException('شخص یافت نشد');
    const office = await this.ensureOffice();
    const fields = {
      fullName: person.fullName,
      nationalId: person.nationalId ?? '',
      trackingCode: person.caseTrackingCode ?? '',
      jobTitle: person.activityJob?.title ?? '',
      unitTitle: person.businessUnitTitle ?? '',
      address: person.premiseAddress ?? '',
      phone: person.phone ?? '',
      date: new Date().toISOString().slice(0, 10),
      centerName: PLACES_NAME,
    };
    return {
      id: row.id,
      centerName: PLACES_NAME,
      centerPhone: office.phone,
      nationalId: person.nationalId,
      letterTitle: office.letterTitle?.trim() || `اعلام نظر ${PLACES_NAME}`,
      letterBody: office.letterBody?.trim() || DEFAULT_LETTER_BODY,
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
    if (input.channel === CaseInquiryChannel.SYSTEM) {
      const office = await this.ensureOffice();
      if (!actor.isAdmin && office.officerId !== actor.id) {
        throw new ForbiddenException('این پرونده برای اداره اماکن شما نیست');
      }
    }
    if (row.status !== CaseInquiryStatus.PENDING) {
      throw new BadRequestException('نظر اداره اماکن قبلاً ثبت شده است');
    }
    if (input.status !== CaseInquiryStatus.APPROVED && input.status !== CaseInquiryStatus.REJECTED) {
      throw new BadRequestException('نتیجه معتبر نیست');
    }
    const note = input.note?.trim() || null;
    if (input.status === CaseInquiryStatus.REJECTED && !note) {
      throw new BadRequestException('برای رد توضیحات لازم است');
    }
    if (input.file?.buffer?.length) {
      const fileId = randomUUID();
      const stored = await this.files.savePlaces({
        personId: row.userId,
        reviewId: row.id,
        fileId,
        buffer: input.file.buffer,
        mimeType: input.file.mimeType,
        originalName: input.file.originalName,
      });
      await this.prisma.casePlacesFile.create({
        data: {
          id: fileId,
          reviewId: row.id,
          storageKey: stored.storageKey,
          originalName: stored.originalName,
          mimeType: stored.mimeType,
          byteSize: stored.byteSize,
          uploadedById: actor.id,
        },
      });
    }
    const saved = await this.prisma.casePlacesReview.update({
      where: { id: row.id },
      data: {
        status: input.status,
        channel: input.channel,
        note,
        decidedById: actor.id,
        decidedAt: new Date(),
      },
      include: reviewInclude,
    });
    return this.mapReview(saved);
  }

  async reopen(id: string) {
    const row = await this.prisma.casePlacesReview.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('نظر اداره اماکن یافت نشد');
    const saved = await this.prisma.casePlacesReview.update({
      where: { id },
      data: {
        status: CaseInquiryStatus.PENDING,
        channel: null,
        note: null,
        decidedById: null,
        decidedAt: null,
      },
      include: reviewInclude,
    });
    return this.mapReview(saved);
  }

  async inbox(actor: InquiryActor, query: FindCaseInquiriesQueryDto) {
    await this.assertInbox(actor);
    const q = query.q?.trim();
    const digits = q ? normalizeSearchDigits(q) : '';
    const where: Prisma.CasePlacesReviewWhereInput = {
      status: query.status,
      OR: q
        ? [
            { user: { fullName: containsInsensitive(q) } },
            { user: { businessUnitTitle: containsInsensitive(q) } },
            { user: { activityJob: { title: containsInsensitive(q) } } },
            ...(digits
              ? [
                  { user: { nationalId: { contains: digits } } },
                  { user: { caseTrackingCode: { contains: digits } } },
                ]
              : []),
          ]
        : undefined,
    };
    const orderBy = resolveSortOrder<Prisma.CasePlacesReviewOrderByWithRelationInput>(
      query.sortBy,
      query.sortDir,
      {
        applicant: (dir) => ({ user: { fullName: dir } }),
        nationalId: (dir) => ({ user: { nationalId: dir } }),
        center: (dir) => ({ createdAt: dir }),
        job: (dir) => ({ user: { activityJob: { title: dir } } }),
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
      user: {
        select: {
          id: true,
          fullName: true,
          nationalId: true,
          caseTrackingCode: true,
          businessUnitTitle: true,
          activityJob: { select: { title: true } },
        },
      },
    } satisfies Prisma.CasePlacesReviewSelect;

    const mapRow = (row: Prisma.CasePlacesReviewGetPayload<{ select: typeof select }>) => ({
      id: row.id,
      status: row.status,
      channel: row.channel,
      createdAt: row.createdAt,
      decidedAt: row.decidedAt,
      centerName: PLACES_NAME,
      applicantName: row.user.fullName,
      nationalId: row.user.nationalId,
      trackingCode: row.user.caseTrackingCode,
      unitTitle: row.user.businessUnitTitle,
      jobTitle: row.user.activityJob?.title ?? null,
    });

    const centers = [{ id: OFFICE_ID, name: PLACES_NAME }];
    if (!wantsPagination(query)) {
      const items = await this.prisma.casePlacesReview.findMany({ where, orderBy, select });
      return items.map(mapRow);
    }
    const { page, pageSize, skip, take } = paginationArgs(query);
    const [items, total] = await Promise.all([
      this.prisma.casePlacesReview.findMany({ where, orderBy, skip, take, select }),
      this.prisma.casePlacesReview.count({ where }),
    ]);
    return {
      ...paginatedResult(items.map(mapRow), total, page, pageSize),
      centers,
    };
  }

  async dossier(id: string, actor: InquiryActor) {
    const row = await this.findReadable(id, actor);
    return this.inquiries.personDossier(row.userId);
  }

  async readDossierFile(id: string, versionId: string, actor: InquiryActor) {
    const row = await this.findReadable(id, actor);
    return this.inquiries.readPersonDocument(row.userId, versionId);
  }

  async detail(id: string, actor: InquiryActor) {
    const row = await this.findReadable(id, actor);
    const person = await this.prisma.user.findUnique({
      where: { id: row.userId },
      select: {
        fullName: true,
        gender: true,
        nationalId: true,
        caseTrackingCode: true,
        phone: true,
        businessUnitTitle: true,
        activityJob: { select: { title: true } },
      },
    });
    return {
      ...this.mapReview(row),
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
    const file = await this.prisma.casePlacesFile.findUnique({
      where: { id: fileId },
      include: { review: { include: reviewInclude } },
    });
    if (!file) throw new NotFoundException('پیوست یافت نشد');
    await this.assertReadable(actor);
    const data = await this.files.read(file.storageKey);
    return {
      mimeType: file.mimeType,
      byteSize: file.byteSize,
      originalName: file.originalName,
      data,
    };
  }

  async advanceAfterDecision(reviewId: string) {
    const review = await this.prisma.casePlacesReview.findUnique({
      where: { id: reviewId },
      select: { userId: true, status: true },
    });
    if (!review || review.status === CaseInquiryStatus.PENDING) return null;
    const user = await this.prisma.user.findUnique({
      where: { id: review.userId },
      select: { id: true, formationStep: true },
    });
    if (!user || user.formationStep !== 4) return null;
    return this.prisma.user.update({
      where: { id: user.id },
      data: { formationStep: 5 },
      select: { id: true, formationStep: true },
    });
  }

  private async mapReview(row: ReviewRecord) {
    const office = await this.ensureOffice();
    return {
      id: row.id,
      status: row.status,
      channel: row.channel,
      note: row.note,
      createdAt: row.createdAt,
      decidedAt: row.decidedAt,
      decidedBy: row.decidedBy,
      center: {
        id: OFFICE_ID,
        name: PLACES_NAME,
        phone: office.phone,
        officerName: office.officer?.fullName ?? null,
      },
      files: row.files,
    };
  }

  private async ensureOffice() {
    return this.prisma.casePlacesOffice.upsert({
      where: { id: OFFICE_ID },
      create: { id: OFFICE_ID },
      update: {},
      select: {
        id: true,
        phone: true,
        officerId: true,
        letterTitle: true,
        letterBody: true,
        officer: { select: { fullName: true } },
      },
    });
  }

  private async findReadable(id: string, actor: InquiryActor) {
    const row = await this.prisma.casePlacesReview.findUnique({
      where: { id },
      include: reviewInclude,
    });
    if (!row) throw new NotFoundException('نظر اداره اماکن یافت نشد');
    await this.assertReadable(actor);
    return row;
  }

  private async assertReadable(actor: InquiryActor) {
    if (actor.isAdmin || actor.formation) return;
    const office = await this.ensureOffice();
    if (office.officerId === actor.id) return;
    throw new ForbiddenException('این پرونده برای اداره اماکن شما نیست');
  }

  private async assertInbox(actor: InquiryActor) {
    if (actor.isAdmin) return;
    const office = await this.ensureOffice();
    if (office.officerId === actor.id) return;
    throw new ForbiddenException('این پرونده برای اداره اماکن شما نیست');
  }
}
