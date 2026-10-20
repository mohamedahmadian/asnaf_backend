import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  containsInsensitive,
  normalizeSearchDigits,
  paginatedResult,
  paginationArgs,
} from '../common/pagination';
import { resolveSortOrder } from '../common/sort-query';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { parseDateOnly } from '../violations/calendar';
import {
  FindSmsHistoryQueryDto,
  smsMessageSources,
} from './dto/find-sms-history.dto';

const TEHRAN_OFFSET_MS = (3 * 60 + 30) * 60 * 1000;

function tehranDayStart(isoDate: string) {
  const parsed = parseDateOnly(isoDate);
  if (!parsed) return null;
  return new Date(parsed.getTime() - TEHRAN_OFFSET_MS);
}

export type SmsMessageSource = (typeof smsMessageSources)[number];

export type SendSmsInput = {
  phone: string;
  body: string;
  source?: SmsMessageSource;
};

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * ارسال واقعی به درگاه هنوز وصل نیست.
   * هر دستور ارسال در تاریخچه ثبت می‌شود تا بعداً همان‌جا به درگاه وصل شود.
   */
  async send(input: SendSmsInput) {
    this.logger.warn(
      `SMS mock. Would send to ${input.phone} (${input.body.length} chars)`,
    );
    await this.prisma.smsMessage.create({
      data: {
        phone: input.phone,
        body: input.body,
        source: input.source ?? 'MANUAL',
        status: 'SKIPPED',
      },
    });
    return {
      mocked: true,
      skipped: true,
      message: 'سرویس پیامک به‌زودی پیاده‌سازی می‌شود',
    };
  }

  async listHistory(query: FindSmsHistoryQueryDto) {
    const where = this.historyWhere(query);
    const orderBy = resolveSortOrder<Prisma.SmsMessageOrderByWithRelationInput>(
      query.sortBy,
      query.sortDir,
      {
        createdAt: (dir) => ({ createdAt: dir }),
        phone: (dir) => ({ phone: dir }),
        status: (dir) => ({ status: dir }),
      },
      [{ createdAt: 'desc' }, { id: 'asc' }],
    );
    const { page, pageSize, skip, take } = paginationArgs(query);
    const [items, total] = await Promise.all([
      this.prisma.smsMessage.findMany({
        where,
        orderBy,
        skip,
        take,
        select: {
          id: true,
          phone: true,
          body: true,
          status: true,
          source: true,
          createdAt: true,
        },
      }),
      this.prisma.smsMessage.count({ where }),
    ]);
    return paginatedResult(items, total, page, pageSize);
  }

  private historyWhere(query: FindSmsHistoryQueryDto): Prisma.SmsMessageWhereInput {
    const from = query.from ? tehranDayStart(query.from) : undefined;
    const toStart = query.to ? tehranDayStart(query.to) : undefined;
    if ((query.from && !from) || (query.to && !toStart)) {
      throw new BadRequestException('تاریخ نامعتبر است');
    }
    if (from && toStart && from.getTime() > toStart.getTime()) {
      throw new BadRequestException('بازه تاریخ نامعتبر است');
    }
    const createdAt =
      from || toStart
        ? {
            gte: from,
            lt: toStart ? new Date(toStart.getTime() + 24 * 60 * 60 * 1000) : undefined,
          }
        : undefined;
    return {
      status: query.status,
      source: query.source,
      createdAt,
      OR: this.searchFilter(query.q),
    };
  }

  private searchFilter(q?: string): Prisma.SmsMessageWhereInput[] | undefined {
    const term = q?.trim();
    if (!term) return undefined;
    const digits = normalizeSearchDigits(term);
    const filters: Prisma.SmsMessageWhereInput[] = [
      { phone: containsInsensitive(term) },
      { body: containsInsensitive(term) },
    ];
    if (digits) {
      filters.push({ phone: containsInsensitive(digits) });
    }
    return filters;
  }
}
