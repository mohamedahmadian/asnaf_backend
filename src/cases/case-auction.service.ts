import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuctionApproverKind,
  CaseInquiryStatus,
  CaseRequestStatus,
  CaseRequestType,
  Prisma,
  UserStatus,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DecideCaseAuctionDto } from './dto/decide-case-auction.dto';
import { SaveCaseAuctionDto } from './dto/save-case-auction.dto';
import { nextRequestNumber } from './formation-steps';
import { findOpenRequest } from './request-process';

type Db = PrismaService | Prisma.TransactionClient;

type Actor = {
  id: string;
  isAdmin?: boolean;
  roleCodes?: string[];
};

const APPROVER_KINDS = [
  AuctionApproverKind.SPECIAL_INSPECTOR,
  AuctionApproverKind.AUCTION_COMMITTEE,
  AuctionApproverKind.COMMERCIAL_MANAGER,
] as const;

const OCCUPIED_STATUSES = [
  CaseRequestStatus.OPEN,
  CaseRequestStatus.ISSUED,
  CaseRequestStatus.COMPLETED,
];

const auctionInclude = {
  items: { orderBy: [{ sortOrder: 'asc' as const }, { id: 'asc' as const }] },
  approvals: {
    include: { decidedBy: { select: { id: true, fullName: true } } },
  },
} satisfies Prisma.CaseAuctionInclude;

function parseDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function dateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

function asNumber(value: Prisma.Decimal | number) {
  return typeof value === 'number' ? value : Number(value);
}

function hundredths(value: number) {
  return Math.round(value * 100);
}

function priceAfterDiscount(price: number, percent: number) {
  return Math.round((price * (10000 - hundredths(percent))) / 10000);
}

function isUniqueConflict(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

function assertRange(dto: SaveCaseAuctionDto) {
  if (dto.endsAt < dto.startsAt) {
    throw new BadRequestException('تاریخ پایان باید بعد از تاریخ شروع یا همان روز باشد');
  }
  if (hundredths(dto.discountMax) < hundredths(dto.discountMin)) {
    throw new BadRequestException('درصد تخفیف تا باید بزرگ‌تر یا مساوی درصد از باشد');
  }
  const min = hundredths(dto.discountMin);
  const max = hundredths(dto.discountMax);
  if (dto.items.some((item) => hundredths(item.discountPercent) < min || hundredths(item.discountPercent) > max)) {
    throw new BadRequestException('درصد تخفیف هر کالا باید بین بازه اعلام‌شده باشد');
  }
}

@Injectable()
export class CaseAuctionService {
  constructor(private readonly prisma: PrismaService) {}

  async find(caseId: string, requestId: string, actor?: Actor) {
    return this.present(this.prisma, caseId, requestId, actor);
  }

  async create(caseId: string, dto: SaveCaseAuctionDto, actor?: Actor) {
    const file = await this.caseFile(caseId);
    assertRange(dto);
    for (let attempt = 0; attempt < 4; attempt++) {
      const number = await nextRequestNumber(this.prisma);
      try {
        return await this.prisma.$transaction(async (tx) => {
          const open = await findOpenRequest(tx, file.id);
          if (open) throw new BadRequestException('یک درخواست باز روی این پرونده وجود دارد');
          await this.assertNoOverlap(tx, file.userId, dto.startsAt, dto.endsAt);
          const request = await tx.caseRequest.create({
            data: {
              caseFileId: file.id,
              type: CaseRequestType.AUCTION,
              number,
              status: CaseRequestStatus.OPEN,
              formationStep: 0,
            },
            select: { id: true },
          });
          await tx.caseRequestEvent.create({
            data: { requestId: request.id, toStatus: CaseRequestStatus.OPEN, actorId: actor?.id ?? null },
          });
          await tx.caseAuction.create({
            data: {
              requestId: request.id,
              startsAt: parseDate(dto.startsAt),
              endsAt: parseDate(dto.endsAt),
              discountMin: dto.discountMin,
              discountMax: dto.discountMax,
              items: {
                create: dto.items.map((item, index) => ({
                  name: item.name.trim(),
                  price: item.price,
                  discountPercent: item.discountPercent,
                  sortOrder: index,
                })),
              },
              approvals: { create: APPROVER_KINDS.map((kind) => ({ kind })) },
            },
          });
          return this.present(tx, file.id, request.id, actor);
        });
      } catch (error) {
        if (!isUniqueConflict(error)) throw error;
      }
    }
    throw new ConflictException('صدور شماره درخواست انجام نشد');
  }

  async update(caseId: string, requestId: string, dto: SaveCaseAuctionDto, actor?: Actor) {
    assertRange(dto);
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "case_auction_approvals" WHERE "requestId" = ${requestId} FOR UPDATE`;
      const current = await this.load(tx, caseId, requestId);
      if (!this.isEditable(current.request.status, current.approvals)) {
        throw new BadRequestException('پس از ثبت نظر، ویرایش درخواست ممکن نیست');
      }
      await this.assertNoOverlap(tx, current.request.caseFile.userId, dto.startsAt, dto.endsAt, requestId);
      await tx.caseAuction.update({
        where: { requestId },
        data: {
          startsAt: parseDate(dto.startsAt),
          endsAt: parseDate(dto.endsAt),
          discountMin: dto.discountMin,
          discountMax: dto.discountMax,
        },
      });
      await tx.caseAuctionItem.deleteMany({ where: { requestId } });
      await tx.caseAuctionItem.createMany({
        data: dto.items.map((item, index) => ({
          requestId,
          name: item.name.trim(),
          price: item.price,
          discountPercent: item.discountPercent,
          sortOrder: index,
        })),
      });
      return this.present(tx, caseId, requestId, actor);
    });
  }

  async decide(caseId: string, requestId: string, approvalId: string, actor: Actor, dto: DecideCaseAuctionDto) {
    const note = dto.note?.trim() || null;
    if (dto.status === 'REJECTED' && !note) {
      throw new BadRequestException('برای رد توضیحات لازم است');
    }
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "case_auction_approvals" WHERE "requestId" = ${requestId} FOR UPDATE`;
      const current = await this.load(tx, caseId, requestId);
      if (current.request.status !== CaseRequestStatus.OPEN) {
        throw new BadRequestException('این درخواست دیگر باز نیست');
      }
      const approval = current.approvals.find((item) => item.id === approvalId);
      if (!approval) throw new NotFoundException('تاییدیه یافت نشد');
      if (approval.status !== CaseInquiryStatus.PENDING) {
        throw new BadRequestException('نتیجه این تاییدیه قبلاً ثبت شده است');
      }
      if (!this.actorCanDecide(actor, approval.kind)) {
        throw new BadRequestException('ثبت این تاییدیه برای نقش شما ممکن نیست');
      }
      await tx.caseAuctionApproval.update({
        where: { id: approval.id },
        data: {
          status: dto.status,
          note,
          decidedById: actor.id,
          decidedAt: new Date(),
        },
      });
      if (dto.status === CaseInquiryStatus.REJECTED) {
        await this.close(tx, requestId, CaseRequestStatus.REJECTED, actor.id);
      } else {
        const pending = await tx.caseAuctionApproval.count({
          where: { requestId, status: CaseInquiryStatus.PENDING },
        });
        if (pending === 0) await this.close(tx, requestId, CaseRequestStatus.COMPLETED, actor.id);
      }
      return this.present(tx, caseId, requestId, actor);
    });
  }

  private async caseFile(caseId: string) {
    const file = await this.prisma.caseFile.findUnique({
      where: { id: caseId },
      select: { id: true, userId: true, licenseNumber: true, formationStep: true },
    });
    if (!file || file.formationStep < 1) throw new NotFoundException('پرونده یافت نشد');
    if (!file.licenseNumber) {
      throw new BadRequestException('قبل از مجوز حراج باید مجوز فعالیت اقتصادی صادر شده باشد');
    }
    return file;
  }

  private async assertNoOverlap(db: Db, userId: string, startsAt: string, endsAt: string, exceptRequestId?: string) {
    await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${userId}, 0::bigint))`;
    const overlap = await db.caseAuction.findFirst({
      where: {
        requestId: exceptRequestId ? { not: exceptRequestId } : undefined,
        startsAt: { lte: parseDate(endsAt) },
        endsAt: { gte: parseDate(startsAt) },
        request: {
          type: CaseRequestType.AUCTION,
          status: { in: OCCUPIED_STATUSES },
          caseFile: { userId },
        },
      },
      select: { requestId: true },
    });
    if (overlap) {
      throw new BadRequestException('برای این شخص در این بازه، درخواست حراج دیگری ثبت شده است');
    }
  }

  private async load(db: Db, caseId: string, requestId: string) {
    const auction = await db.caseAuction.findUnique({
      where: { requestId },
      include: {
        ...auctionInclude,
        request: {
          select: {
            id: true,
            caseFileId: true,
            number: true,
            type: true,
            status: true,
            caseFile: { select: { userId: true } },
          },
        },
      },
    });
    if (!auction || auction.request.caseFileId !== caseId || auction.request.type !== CaseRequestType.AUCTION) {
      throw new NotFoundException('درخواست مجوز حراج یافت نشد');
    }
    return auction;
  }

  private async present(db: Db, caseId: string, requestId: string, actor?: Actor) {
    const auction = await this.load(db, caseId, requestId);
    const people = await db.user.findMany({
      where: {
        status: UserStatus.ACTIVE,
        userRoles: { some: { role: { code: { in: [...APPROVER_KINDS] } } } },
      },
      select: {
        id: true,
        fullName: true,
        userRoles: { select: { role: { select: { code: true } } } },
      },
      orderBy: [{ fullName: 'asc' }, { id: 'asc' }],
    });
    const approvals = [...auction.approvals].sort(
      (left, right) => APPROVER_KINDS.indexOf(left.kind) - APPROVER_KINDS.indexOf(right.kind),
    );
    return {
      id: auction.request.id,
      caseId,
      number: auction.request.number,
      status: auction.request.status,
      editable: this.isEditable(auction.request.status, approvals),
      startsAt: dateOnly(auction.startsAt),
      endsAt: dateOnly(auction.endsAt),
      discountMin: asNumber(auction.discountMin),
      discountMax: asNumber(auction.discountMax),
      items: auction.items.map((item) => {
        const price = asNumber(item.price);
        const discountPercent = asNumber(item.discountPercent);
        return {
          id: item.id,
          name: item.name,
          price,
          discountPercent,
          priceAfterDiscount: priceAfterDiscount(price, discountPercent),
        };
      }),
      approvals: approvals.map((item) => ({
        id: item.id,
        kind: item.kind,
        status: item.status,
        note: item.note,
        decidedAt: item.decidedAt?.toISOString() ?? null,
        decidedBy: item.decidedBy,
        people: people
          .filter((person) => person.userRoles.some((link) => link.role.code === item.kind))
          .map((person) => ({ id: person.id, fullName: person.fullName })),
        canDecide:
          item.status === CaseInquiryStatus.PENDING &&
          auction.request.status === CaseRequestStatus.OPEN &&
          this.actorCanDecide(actor, item.kind),
      })),
    };
  }

  private isEditable(
    status: CaseRequestStatus,
    approvals: { status: CaseInquiryStatus }[],
  ) {
    return status === CaseRequestStatus.OPEN && approvals.every((item) => item.status === CaseInquiryStatus.PENDING);
  }

  private actorCanDecide(actor: Actor | undefined, kind: AuctionApproverKind) {
    if (!actor?.id) return false;
    if (actor.isAdmin) return true;
    return Boolean(actor.roleCodes?.includes(kind));
  }

  private async close(db: Db, requestId: string, status: CaseRequestStatus, actorId: string) {
    const closed = await db.caseRequest.updateMany({
      where: { id: requestId, status: CaseRequestStatus.OPEN },
      data: {
        status,
        completedAt: status === CaseRequestStatus.COMPLETED ? new Date() : null,
      },
    });
    if (closed.count !== 1) return;
    await db.caseRequestEvent.create({
      data: {
        requestId,
        fromStatus: CaseRequestStatus.OPEN,
        toStatus: status,
        actorId,
      },
    });
  }
}
