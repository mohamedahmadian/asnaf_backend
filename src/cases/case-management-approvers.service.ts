import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  containsInsensitive,
  normalizeSearchDigits,
  paginatedResult,
  paginationArgs,
} from '../common/pagination';
import { resolveSortOrder } from '../common/sort-query';
import { CaseInquiryChannel, CaseInquiryStatus, CaseRequestStatus, CaseRequestType, Prisma, UserStatus } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCaseManagementApproverDto } from './dto/create-case-management-approver.dto';
import { FindCaseManagementApproversQueryDto } from './dto/find-case-management-approvers-query.dto';
import {
  FindManagementReviewsQueryDto,
  type ManagementReviewView,
} from './dto/find-management-reviews-query.dto';
import { managementResponseCutoff } from './management-review-deadline';
import { CaseAuctionService } from './case-auction.service';
import { PersonFileStorage } from './person-file.storage';
import {
  assertRequestMutable,
  findOpenRequest,
  isProcessType,
  isSettingsRequestType,
  managementReachedWhere,
  managementRewindPhase,
  processManagementTitles,
  requestIsOpen,
  requestOnCase,
  rewindRequestPhase,
} from './request-process';
import {
  ISSUANCE_FORMATION_STEP,
  MANAGEMENT_FORMATION_STEP,
  STEWARDSHIP_ISSUANCE_STEP,
  STEWARDSHIP_MANAGEMENT_STEP,
  syncIssuanceRequest,
} from './formation-steps';

export type ManagementDecideActor = {
  id: string;
  isAdmin?: boolean;
  formation?: boolean;
};

const reviewInclude = {
  workUnit: { select: { id: true, title: true } },
  role: { select: { id: true, name: true } },
  decidedBy: { select: { id: true, fullName: true } },
  files: {
    orderBy: { createdAt: 'asc' as const },
    select: {
      id: true,
      originalName: true,
      mimeType: true,
      byteSize: true,
      createdAt: true,
    },
  },
} satisfies Prisma.CaseManagementReviewInclude;

type ReviewRecord = Prisma.CaseManagementReviewGetPayload<{ include: typeof reviewInclude }>;

@Injectable()
export class CaseManagementApproversService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly files: PersonFileStorage,
    private readonly auction: CaseAuctionService,
  ) {}

  async findAll(query: FindCaseManagementApproversQueryDto) {
    const where: Prisma.CaseManagementApproverWhereInput = query.q
      ? {
          OR: [
            { workUnit: { title: containsInsensitive(query.q) } },
            { role: { name: containsInsensitive(query.q) } },
          ],
        }
      : {};
    const orderBy = resolveSortOrder<Prisma.CaseManagementApproverOrderByWithRelationInput>(
      query.sortBy,
      query.sortDir,
      {
        unit: (dir) => ({ workUnit: { title: dir } }),
        role: (dir) => ({ role: { name: dir } }),
      },
      [{ createdAt: 'desc' }, { id: 'asc' }],
    );
    const { page, pageSize, skip, take } = paginationArgs(query);
    const [rows, total] = await Promise.all([
      this.prisma.caseManagementApprover.findMany({
        where,
        orderBy,
        skip,
        take,
        select: {
          id: true,
          workUnitId: true,
          roleId: true,
          createdAt: true,
          workUnit: { select: { title: true } },
          role: { select: { name: true } },
        },
      }),
      this.prisma.caseManagementApprover.count({ where }),
    ]);
    return paginatedResult(
      rows.map((row) => ({
        id: row.id,
        workUnitId: row.workUnitId,
        workUnitTitle: row.workUnit.title,
        roleId: row.roleId,
        roleName: row.role.name,
        createdAt: row.createdAt,
      })),
      total,
      page,
      pageSize,
    );
  }

  async create(dto: CreateCaseManagementApproverDto) {
    const [unit, role] = await Promise.all([
      this.prisma.workUnit.findUnique({
        where: { id: dto.workUnitId },
        select: { id: true },
      }),
      this.prisma.role.findUnique({
        where: { id: dto.roleId },
        select: { id: true },
      }),
    ]);
    if (!unit) {
      throw new NotFoundException('واحد سازمانی یافت نشد');
    }
    if (!role) {
      throw new NotFoundException('نقش یافت نشد');
    }
    try {
      await this.prisma.caseManagementApprover.create({
        data: { workUnitId: dto.workUnitId, roleId: dto.roleId },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('این واحد و نقش قبلاً به فهرست اضافه شده است');
      }
      throw error;
    }
    return { ok: true };
  }

  async remove(id: string) {
    try {
      await this.prisma.caseManagementApprover.delete({ where: { id } });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException('این مورد در فهرست نیست');
      }
      throw error;
    }
    return { ok: true };
  }

  private async targetRequest(caseFileId: string) {
    const open = await findOpenRequest(this.prisma, caseFileId);
    if (open && (isProcessType(open.type) || open.type === 'STEWARDSHIP')) return open;
    return this.prisma.caseRequest.findFirst({
      where: { caseFileId, type: 'ISSUANCE' },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async ensureForRequest(request: {
    id: string;
    caseFileId: string;
    type: string;
    status: CaseRequestStatus;
  }) {
    if (!requestIsOpen(request.status) || !isSettingsRequestType(request.type)) return;
    const roles = await processManagementTitles(this.prisma, request.type);
    if (!roles.length) return;
    await this.prisma.caseManagementReview.createMany({
      data: roles.map((item) => ({
        caseFileId: request.caseFileId,
        caseRequestId: request.id,
        roleId: item.roleId,
      })),
      skipDuplicates: true,
    });
  }

  /** برای هر واحد و نقشِ تنظیمات، یک ردیف در انتظار روی درخواست باز می‌سازد. */
  async ensureForUser(caseFileId: string) {
    const file = await this.prisma.caseFile.findUnique({
      where: { id: caseFileId },
      select: { id: true },
    });
    if (!file) throw new NotFoundException('پرونده یافت نشد');
    const request = await findOpenRequest(this.prisma, caseFileId);
    if (!request) return;
    await this.ensureForRequest(request);
  }

  async assertDelivered(caseFileId: string) {
    await this.ensureForUser(caseFileId);
    const request = await this.targetRequest(caseFileId);
    if (!request) throw new BadRequestException('قبل از صدور مجوز باید نتیجه همه تاییدهای مدیریتی ثبت شود');
    const configured = await processManagementTitles(this.prisma, request.type);
    if (!configured.length) return;
    const roleIds = configured.map((item) => item.roleId);
    const [pending, total] = await Promise.all([
      this.prisma.caseManagementReview.count({
        where: { caseRequestId: request.id, roleId: { in: roleIds }, status: CaseInquiryStatus.PENDING },
      }),
      this.prisma.caseManagementReview.count({
        where: { caseRequestId: request.id, roleId: { in: roleIds } },
      }),
    ]);
    if (total < configured.length || pending > 0) {
      throw new BadRequestException('قبل از صدور مجوز باید نتیجه همه تاییدهای مدیریتی ثبت شود');
    }
  }

  async listForCase(caseFileId: string, requestId?: string) {
    if (!caseFileId) throw new BadRequestException('پرونده مشخص نیست');
    const request = await requestOnCase(this.prisma, caseFileId, requestId);
    if (!request) return [];
    await this.ensureForRequest(request);
    const titles = await processManagementTitles(this.prisma, request.type);
    if (!titles.length) return [];
    const titleByRole = new Map(titles.map((item) => [item.roleId, item.title]));
    const order = new Map(titles.map((item, index) => [item.roleId, index]));
    const rows = (
      await this.prisma.caseManagementReview.findMany({
        where: { caseRequestId: request.id, roleId: { in: [...titleByRole.keys()] } },
        include: reviewInclude,
      })
    ).sort((left, right) => (order.get(left.roleId) ?? 0) - (order.get(right.roleId) ?? 0) || left.id.localeCompare(right.id));
    if (!rows.length) return [];
    const people = await this.prisma.user.findMany({
      where: {
        status: UserStatus.ACTIVE,
        userRoles: { some: { roleId: { in: rows.map((row) => row.roleId) } } },
      },
      select: {
        id: true,
        fullName: true,
        workUnitId: true,
        userRoles: { select: { roleId: true } },
      },
      orderBy: [{ fullName: 'asc' }, { id: 'asc' }],
    });
    return rows.map((row) => this.mapReview(row, people, titleByRole.get(row.roleId) ?? null));
  }

  async decide(
    id: string,
    actor: ManagementDecideActor,
    input: {
      status: string;
      note?: string | null;
      channel: CaseInquiryChannel;
      file?: { buffer: Buffer; mimeType: string; originalName: string };
    },
  ) {
    const row = await this.prisma.caseManagementReview.findUnique({
      where: { id },
      include: reviewInclude,
    });
    if (!row) throw new NotFoundException('تایید مدیریتی یافت نشد');
    await this.assertOwnRole(actor, row.roleId);
    await assertRequestMutable(this.prisma, row.caseRequestId, actor.id);
    if (row.status !== CaseInquiryStatus.PENDING) {
      throw new BadRequestException('نتیجه این تایید قبلاً ثبت شده است');
    }
    if (input.status !== CaseInquiryStatus.APPROVED && input.status !== CaseInquiryStatus.REJECTED) {
      throw new BadRequestException('نتیجه تایید معتبر نیست');
    }
    const note = input.note?.trim() || null;
    if (input.status === CaseInquiryStatus.REJECTED && !note) {
      throw new BadRequestException('برای رد توضیحات لازم است');
    }
    if (input.file?.buffer?.length) {
      const fileId = randomUUID();
      const stored = await this.files.saveManagementReview({
        personId: (await this.ownerId(row.caseFileId)) ?? row.caseFileId,
        reviewId: row.id,
        fileId,
        buffer: input.file.buffer,
        mimeType: input.file.mimeType,
        originalName: input.file.originalName,
      });
      await this.prisma.caseManagementReviewFile.create({
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
    const saved = await this.prisma.caseManagementReview.update({
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
    return this.mapReview(saved, await this.peopleFor(saved));
  }

  async reopen(id: string, actorId?: string) {
    const row = await this.prisma.caseManagementReview.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('تایید مدیریتی یافت نشد');
    await assertRequestMutable(this.prisma, row.caseRequestId, actorId);
    const saved = await this.prisma.caseManagementReview.update({
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
    const phase = owner ? managementRewindPhase(owner.type) : null;
    if (phase != null) await rewindRequestPhase(this.prisma, saved.caseRequestId, phase);
    await this.auction.syncPhase(saved.caseRequestId);
    return this.mapReview(saved, await this.peopleFor(saved));
  }

  async readFile(fileId: string) {
    const file = await this.prisma.caseManagementReviewFile.findUnique({ where: { id: fileId } });
    if (!file) throw new NotFoundException('پیوست یافت نشد');
    const data = await this.files.read(file.storageKey);
    return {
      mimeType: file.mimeType,
      byteSize: file.byteSize,
      originalName: file.originalName,
      data,
    };
  }

  /** آمار کارتابل نقش‌های کاربر. معوق یعنی هنوز بی‌پاسخ و گذشته از مهلت پاسخ. */
  async stats(actor: ManagementDecideActor) {
    const roleIds = await this.roleIdsOf(actor.id);
    if (!roleIds.length) return { referred: 0, decided: 0, reviewing: 0, overdue: 0, titles: [] as string[] };
    await this.ensureQueue(roleIds);
    const scope = this.inboxScope(roleIds);
    const cutoff = new Date(managementResponseCutoff());
    const [referred, decided, reviewing, overdue, titles] = await Promise.all([
      this.prisma.caseManagementReview.count({ where: scope }),
      this.prisma.caseManagementReview.count({
        where: { AND: [scope, { status: { not: CaseInquiryStatus.PENDING } }] },
      }),
      this.prisma.caseManagementReview.count({
        where: { AND: [scope, { status: CaseInquiryStatus.PENDING, createdAt: { gte: cutoff } }] },
      }),
      this.prisma.caseManagementReview.count({
        where: { AND: [scope, { status: CaseInquiryStatus.PENDING, createdAt: { lt: cutoff } }] },
      }),
      this.approvalTitles(roleIds),
    ]);
    return { referred, decided, reviewing, overdue, titles };
  }

  /** عنوان نمایشی تاییدیهٔ مدیریتی برای نقش‌های کاربر، نه نام نقش حساب. */
  private async approvalTitles(roleIds: string[]) {
    const rows = await this.prisma.caseProcessManagementRole.findMany({
      where: { roleId: { in: roleIds } },
      select: { title: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    const titles: string[] = [];
    const seen = new Set<string>();
    for (const row of rows) {
      const title = row.title.trim();
      if (!title || seen.has(title)) continue;
      seen.add(title);
      titles.push(title);
    }
    return titles;
  }

  /** صف نقش‌های داده‌شده، یا همهٔ نقش‌های تنظیم‌شده اگر شناسه‌ای نیاید. */
  async syncQueue(roleIds?: string[]) {
    if (roleIds && !roleIds.length) return;
    const ids =
      roleIds ??
      (
        await this.prisma.caseProcessManagementRole.findMany({
          select: { roleId: true },
        })
      ).map((row) => row.roleId);
    const unique = [...new Set(ids)];
    if (!unique.length) return;
    await this.ensureQueue(unique);
  }

  async inbox(actor: ManagementDecideActor, query: FindManagementReviewsQueryDto) {
    const roleIds = await this.roleIdsOf(actor.id);
    const { page, pageSize, skip, take } = paginationArgs(query);
    if (!roleIds.length) return paginatedResult([], 0, page, pageSize);
    await this.ensureQueue(roleIds);
    const q = query.q?.trim();
    const digits = q ? normalizeSearchDigits(q) : '';
    const viewWhere = this.viewWhere(query.view);
    const where: Prisma.CaseManagementReviewWhereInput = {
      AND: [
        this.inboxScope(roleIds),
        ...(query.status ? [{ status: query.status }] : []),
        ...(Object.keys(viewWhere).length ? [viewWhere] : []),
        ...(q
          ? [
              {
                OR: [
                  { caseFile: { user: { fullName: containsInsensitive(q) } } },
                  { caseFile: { businessUnitTitle: containsInsensitive(q) } },
                  { caseFile: { activityJob: { title: containsInsensitive(q) } } },
                  { caseRequest: { number: containsInsensitive(q) } },
                  ...(digits
                    ? [
                        { caseFile: { user: { nationalId: { contains: digits } } } },
                        { caseFile: { trackingCode: { contains: digits } } },
                      ]
                    : []),
                ],
              },
            ]
          : []),
      ],
    };
    const orderBy = resolveSortOrder<Prisma.CaseManagementReviewOrderByWithRelationInput>(
      query.sortBy,
      query.sortDir,
      {
        applicant: (dir) => ({ caseFile: { user: { fullName: dir } } }),
        nationalId: (dir) => ({ caseFile: { user: { nationalId: dir } } }),
        job: (dir) => ({ caseFile: { activityJob: { title: dir } } }),
        requestType: (dir) => ({ caseRequest: { type: dir } }),
        status: (dir) => ({ status: dir }),
        createdAt: (dir) => ({ createdAt: dir }),
      },
      [{ status: 'asc' }, { createdAt: 'desc' }, { id: 'asc' }],
    );
    const [rows, total] = await Promise.all([
      this.prisma.caseManagementReview.findMany({
        where,
        orderBy,
        skip,
        take,
        select: {
          id: true,
          status: true,
          roleId: true,
          createdAt: true,
          caseFileId: true,
          caseRequestId: true,
          role: { select: { name: true } },
          caseRequest: { select: { type: true, number: true } },
          caseFile: {
            select: {
              businessUnitTitle: true,
              trackingCode: true,
              activityJob: { select: { title: true } },
              user: { select: { fullName: true, nationalId: true } },
            },
          },
        },
      }),
      this.prisma.caseManagementReview.count({ where }),
    ]);
    const titles = await this.prisma.caseProcessManagementRole.findMany({
      where: { roleId: { in: roleIds } },
      select: { requestType: true, roleId: true, title: true },
    });
    return paginatedResult(
      rows.map((row) => ({
        id: row.id,
        status: row.status,
        roleId: row.roleId,
        roleName: row.role.name,
        displayTitle:
          titles.find((item) => item.requestType === row.caseRequest.type && item.roleId === row.roleId)?.title ??
          row.role.name,
        caseFileId: row.caseFileId,
        requestId: row.caseRequestId,
        requestType: row.caseRequest.type,
        requestNumber: row.caseRequest.number,
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

  /** بعد از آخرین تاییدیه، درخواست به مرحلهٔ صدور می‌رود. حراج را syncPhase خودش جلو می‌برد. */
  async advanceAfterDecision(reviewId: string) {
    const review = await this.prisma.caseManagementReview.findUnique({
      where: { id: reviewId },
      select: {
        status: true,
        caseRequest: {
          select: { id: true, type: true, status: true, formationStep: true, caseFileId: true },
        },
      },
    });
    if (!review || review.status === CaseInquiryStatus.PENDING) return null;
    const request = review.caseRequest;
    if (!requestIsOpen(request.status) || request.type === CaseRequestType.AUCTION) return null;
    const configured = await processManagementTitles(this.prisma, request.type);
    if (!configured.length) return null;
    const configuredRoleIds = configured.map((item) => item.roleId);
    const [pending, total] = await Promise.all([
      this.prisma.caseManagementReview.count({
        where: { caseRequestId: request.id, roleId: { in: configuredRoleIds }, status: CaseInquiryStatus.PENDING },
      }),
      this.prisma.caseManagementReview.count({
        where: { caseRequestId: request.id, roleId: { in: configuredRoleIds } },
      }),
    ]);
    if (total < configured.length || pending > 0) return null;

    if (request.type === CaseRequestType.ISSUANCE) {
      const file = await this.prisma.caseFile.findUnique({
        where: { id: request.caseFileId },
        select: { formationStep: true },
      });
      if (!file || file.formationStep !== MANAGEMENT_FORMATION_STEP) return null;
      await this.prisma.caseFile.update({
        where: { id: request.caseFileId },
        data: { formationStep: ISSUANCE_FORMATION_STEP },
      });
      await syncIssuanceRequest(this.prisma, request.caseFileId);
      return { formationStep: ISSUANCE_FORMATION_STEP };
    }

    if (request.type === CaseRequestType.STEWARDSHIP) {
      if (request.formationStep !== STEWARDSHIP_MANAGEMENT_STEP) return null;
      await this.prisma.$transaction([
        this.prisma.caseRequest.update({
          where: { id: request.id },
          data: { formationStep: STEWARDSHIP_ISSUANCE_STEP },
        }),
        this.prisma.caseFile.updateMany({
          where: {
            id: request.caseFileId,
            formationStep: STEWARDSHIP_MANAGEMENT_STEP,
            cardNumber: null,
          },
          data: { formationStep: STEWARDSHIP_ISSUANCE_STEP },
        }),
      ]);
      return { formationStep: STEWARDSHIP_ISSUANCE_STEP };
    }

    if (request.type === CaseRequestType.RENEWAL || request.type === CaseRequestType.LOCATION_CHANGE) {
      if (request.formationStep !== 4) return null;
      await this.prisma.caseRequest.update({
        where: { id: request.id },
        data: { formationStep: 5 },
      });
      return { formationStep: 5 };
    }
    return null;
  }

  private inboxScope(roleIds: string[]): Prisma.CaseManagementReviewWhereInput {
    return {
      roleId: { in: roleIds },
      caseRequest: {
        status: CaseRequestStatus.OPEN,
        AND: [managementReachedWhere()],
      },
    };
  }

  private viewWhere(view?: ManagementReviewView): Prisma.CaseManagementReviewWhereInput {
    if (!view || view === 'referred') return {};
    const cutoff = new Date(managementResponseCutoff());
    if (view === 'decided') return { status: { not: CaseInquiryStatus.PENDING } };
    if (view === 'overdue') return { status: CaseInquiryStatus.PENDING, createdAt: { lt: cutoff } };
    return { status: CaseInquiryStatus.PENDING, createdAt: { gte: cutoff } };
  }

  private async roleIdsOf(userId: string) {
    const rows = await this.prisma.userRole.findMany({
      where: { userId },
      select: { roleId: true },
    });
    return rows.map((row) => row.roleId);
  }

  private async ensureQueue(roleIds: string[]) {
    const links = await this.prisma.caseProcessManagementRole.findMany({
      where: { roleId: { in: roleIds } },
      select: { requestType: true, roleId: true },
    });
    if (!links.length) return;
    const requests = await this.prisma.caseRequest.findMany({
      where: {
        status: CaseRequestStatus.OPEN,
        type: { in: [...new Set(links.map((link) => link.requestType))] },
        AND: [managementReachedWhere()],
      },
      select: { id: true, caseFileId: true, type: true },
    });
    const data = requests.flatMap((request) =>
      links
        .filter((link) => link.requestType === request.type)
        .map((link) => ({
          caseFileId: request.caseFileId,
          caseRequestId: request.id,
          roleId: link.roleId,
        })),
    );
    if (!data.length) return;
    await this.prisma.caseManagementReview.createMany({ data, skipDuplicates: true });
  }

  private async assertOwnRole(actor: ManagementDecideActor, roleId: string) {
    if (actor.isAdmin) return;
    const link = await this.prisma.userRole.findUnique({
      where: { userId_roleId: { userId: actor.id, roleId } },
      select: { userId: true },
    });
    if (!link) throw new ForbiddenException('این تاییدیه برای نقش شما نیست');
  }

  private async ownerId(caseFileId: string) {
    const row = await this.prisma.caseFile.findUnique({
      where: { id: caseFileId },
      select: { userId: true },
    });
    return row?.userId ?? null;
  }

  private async peopleFor(row: { roleId: string }) {
    return this.prisma.user.findMany({
      where: {
        status: UserStatus.ACTIVE,
        userRoles: { some: { roleId: row.roleId } },
      },
      select: {
        id: true,
        fullName: true,
        workUnitId: true,
        userRoles: { select: { roleId: true } },
      },
      orderBy: [{ fullName: 'asc' }, { id: 'asc' }],
    });
  }

  private mapReview(
    row: ReviewRecord,
    people: {
      id: string;
      fullName: string;
      workUnitId: string | null;
      userRoles: { roleId: string }[];
    }[],
    displayTitle: string | null = null,
  ) {
    return {
      id: row.id,
      status: row.status,
      channel: row.channel,
      note: row.note,
      createdAt: row.createdAt,
      decidedAt: row.decidedAt,
      decidedBy: row.decidedBy,
      workUnitTitle: row.workUnit?.title ?? null,
      roleId: row.roleId,
      roleName: row.role.name,
      displayTitle,
      people: people
        .filter((person) => person.userRoles.some((link) => link.roleId === row.roleId))
        .map((person) => ({ id: person.id, fullName: person.fullName })),
      files: row.files,
    };
  }
}
