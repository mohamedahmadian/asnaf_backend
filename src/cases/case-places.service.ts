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
  CaseRequestType,
  Prisma,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CaseAuctionService } from './case-auction.service';
import { CaseInquiriesService, type InquiryActor } from './case-inquiries.service';
import { syncIssuanceRequest } from './formation-steps';
import { findOpenRequest, placesRewindPhase, requestIsOpen, requestOnCase, rewindRequestPhase } from './request-process';
import { FindCaseInquiriesQueryDto } from './dto/find-case-inquiries-query.dto';
import { SaveCasePlacesOfficeDto } from './dto/save-case-places-office.dto';
import { PersonFileStorage } from './person-file.storage';
import { activityContext } from './steward-context';

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
    private readonly auction: CaseAuctionService,
  ) {}

  async office() {
    const row = await this.ensureOffice();
    return {
      id: row.id,
      phone: row.phone,
      officerRoleId: row.officerRoleId,
      officerRoleName: row.officerRole?.name ?? null,
      letterTitle: row.letterTitle,
      letterBody: row.letterBody,
    };
  }

  async saveOffice(dto: SaveCasePlacesOfficeDto) {
    if (dto.officerRoleId) {
      const role = await this.prisma.role.findUnique({
        where: { id: dto.officerRoleId },
        select: { id: true },
      });
      if (!role) throw new NotFoundException('نقش یافت نشد');
    }
    const phone = dto.phone?.replace(/\D/g, '') || null;
    await this.prisma.casePlacesOffice.upsert({
      where: { id: OFFICE_ID },
      create: {
        id: OFFICE_ID,
        phone,
        officerRoleId: dto.officerRoleId ?? null,
        letterTitle: dto.letterTitle?.trim() || null,
        letterBody: dto.letterBody?.trim() || null,
      },
      update: {
        phone,
        officerRoleId: dto.officerRoleId ?? null,
        letterTitle: dto.letterTitle?.trim() || null,
        letterBody: dto.letterBody?.trim() || null,
      },
    });
    return this.office();
  }

  async ensureForUser(caseFileId: string) {
    const open = await findOpenRequest(this.prisma, caseFileId);
    if (
      open?.type === CaseRequestType.ISSUANCE ||
      open?.type === CaseRequestType.RENEWAL ||
      open?.type === CaseRequestType.LOCATION_CHANGE ||
      open?.type === CaseRequestType.STEWARDSHIP
    ) {
      return this.prisma.casePlacesReview.upsert({
        where: { caseRequestId: open.id },
        create: { caseFileId, caseRequestId: open.id },
        update: {},
        include: reviewInclude,
      });
    }
    const issuance = await this.prisma.caseRequest.findFirst({
      where: { caseFileId, type: CaseRequestType.ISSUANCE },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    if (!issuance) return null;
    return this.prisma.casePlacesReview.findUnique({
      where: { caseRequestId: issuance.id },
      include: reviewInclude,
    });
  }

  async assertDelivered(caseFileId: string) {
    const open = await findOpenRequest(this.prisma, caseFileId);
    const requestId =
      open?.type === CaseRequestType.ISSUANCE ||
      open?.type === CaseRequestType.RENEWAL ||
      open?.type === CaseRequestType.LOCATION_CHANGE ||
      open?.type === CaseRequestType.STEWARDSHIP
        ? open.id
        : null;
    const row = requestId
      ? await this.prisma.casePlacesReview.findUnique({
          where: { caseRequestId: requestId },
          select: { status: true },
        })
      : null;
    if (!row || row.status === CaseInquiryStatus.PENDING) {
      throw new BadRequestException('قبل از تاییدهای مدیریتی باید نظر اداره اماکن ثبت شود');
    }
  }

  async listForCase(caseFileId: string, requestId?: string) {
    const request = await requestOnCase(this.prisma, caseFileId, requestId);
    if (!request) return null;
    const placesRequest =
      request.type === CaseRequestType.ISSUANCE ||
      request.type === CaseRequestType.RENEWAL ||
      request.type === CaseRequestType.LOCATION_CHANGE ||
      request.type === CaseRequestType.STEWARDSHIP;
    if (!placesRequest) return null;
    if (requestIsOpen(request.status)) {
      const row = await this.prisma.casePlacesReview.upsert({
        where: { caseRequestId: request.id },
        create: { caseFileId: request.caseFileId, caseRequestId: request.id },
        update: {},
        include: reviewInclude,
      });
      return this.mapReview(row);
    }
    const row = await this.prisma.casePlacesReview.findUnique({
      where: { caseRequestId: request.id },
      include: reviewInclude,
    });
    if (!row) return null;
    return this.mapReview(row);
  }

  async letter(id: string, actor: InquiryActor) {
    const row = await this.findReadable(id, actor);
    const person = await this.letterSubject(row.caseFileId);
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
      if (!actor.isAdmin && !(await this.actorHasOfficerRole(actor.id, office.officerRoleId))) {
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
        personId: (await this.ownerId(row.caseFileId)) ?? row.caseFileId,
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
    await this.auction.syncPhase(saved.caseRequestId);
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
    const owner = await this.prisma.caseRequest.findUnique({
      where: { id: saved.caseRequestId },
      select: { type: true },
    });
    const phase = owner ? placesRewindPhase(owner.type) : null;
    if (phase != null) await rewindRequestPhase(this.prisma, saved.caseRequestId, phase);
    await this.auction.syncPhase(saved.caseRequestId);
    return this.mapReview(saved);
  }

  async inbox(actor: InquiryActor, query: FindCaseInquiriesQueryDto) {
    await this.assertInbox(actor);
    const q = query.q?.trim();
    const digits = q ? normalizeSearchDigits(q) : '';
    const where: Prisma.CasePlacesReviewWhereInput = {
      status: query.status,
      caseRequest: { type: { not: CaseRequestType.AUCTION } },
      OR: q
        ? [
            { caseFile: { user: { fullName: containsInsensitive(q) } } },
            { caseFile: { businessUnitTitle: containsInsensitive(q) } },
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
    const orderBy = resolveSortOrder<Prisma.CasePlacesReviewOrderByWithRelationInput>(
      query.sortBy,
      query.sortDir,
      {
        applicant: (dir) => ({ caseFile: { user: { fullName: dir } } }),
        nationalId: (dir) => ({ caseFile: { user: { nationalId: dir } } }),
        center: (dir) => ({ createdAt: dir }),
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
      caseFile: {
        select: {
          id: true,
          trackingCode: true,
          businessUnitTitle: true,
          activityJob: { select: { title: true } },
          user: { select: { fullName: true, nationalId: true } },
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
      applicantName: row.caseFile.user.fullName,
      nationalId: row.caseFile.user.nationalId,
      trackingCode: row.caseFile.trackingCode,
      unitTitle: row.caseFile.businessUnitTitle,
      jobTitle: row.caseFile.activityJob?.title ?? null,
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
    return this.inquiries.personDossier(row.caseFileId);
  }

  async readDossierFile(id: string, versionId: string, actor: InquiryActor) {
    const row = await this.findReadable(id, actor);
    const userId = await this.ownerId(row.caseFileId);
    if (!userId) throw new NotFoundException('شخص یافت نشد');
    return this.inquiries.readPersonDocument(userId, versionId);
  }

  async detail(id: string, actor: InquiryActor) {
    const row = await this.findReadable(id, actor);
    const person = await this.letterSubject(row.caseFileId);
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
      select: { caseFileId: true, status: true },
    });
    if (!review || review.status === CaseInquiryStatus.PENDING) return null;
    const user = await this.prisma.caseFile.findUnique({
      where: { id: review.caseFileId },
      select: { id: true, formationStep: true },
    });
    if (!user || user.formationStep !== 4) return null;
    const saved = await this.prisma.caseFile.update({
      where: { id: user.id },
      data: { formationStep: 5 },
      select: { id: true, formationStep: true },
    });
    await syncIssuanceRequest(this.prisma, saved.id);
    return saved;
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
    const context = await activityContext(this.prisma, caseFileId);
    return {
      fullName: row.user.fullName,
      gender: row.user.gender,
      nationalId: row.user.nationalId,
      phone: row.user.phone,
      caseTrackingCode: row.trackingCode,
      businessUnitTitle: context?.businessUnitTitle ?? row.businessUnitTitle,
      premiseAddress: context?.premiseAddress ?? row.premiseAddress,
      activityJob: context?.activityJob ?? row.activityJob,
    };
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
        officerName: office.officerRole?.name ?? null,
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
        officerRoleId: true,
        letterTitle: true,
        letterBody: true,
        officerRole: { select: { name: true } },
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

  private async actorHasOfficerRole(actorId: string, roleId: string | null) {
    if (!roleId) return false;
    const link = await this.prisma.userRole.findUnique({
      where: { userId_roleId: { userId: actorId, roleId } },
      select: { userId: true },
    });
    return Boolean(link);
  }

  private async assertReadable(actor: InquiryActor) {
    if (actor.isAdmin || actor.formation) return;
    const office = await this.ensureOffice();
    if (await this.actorHasOfficerRole(actor.id, office.officerRoleId)) return;
    throw new ForbiddenException('این پرونده برای اداره اماکن شما نیست');
  }

  private async assertInbox(actor: InquiryActor) {
    if (actor.isAdmin) return;
    const office = await this.ensureOffice();
    if (await this.actorHasOfficerRole(actor.id, office.officerRoleId)) return;
    throw new ForbiddenException('این پرونده برای اداره اماکن شما نیست');
  }
}
