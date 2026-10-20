import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { addDaysIso, todayIsoDateTehran } from '../common/iso-date';
import {
  paginatedResult,
  paginationArgs,
  type PaginationQueryDto,
} from '../common/pagination';
import {
  Prisma,
  ScheduledJobRunStatus,
  ScheduledJobTrigger,
} from '../generated/prisma/client';
import { CaseStatusService } from '../cases/case-status.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  CASE_STATUS_SYNC_JOB,
  SCHEDULED_JOB_DEFS,
  scheduledJobDef,
  type ScheduledJobDef,
} from './scheduled-job.defs';

type JobResult = {
  message: string;
  detail?: Prisma.InputJsonValue;
};

@Injectable()
export class ScheduledJobsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ScheduledJobsService.name);
  private timers = new Map<string, NodeJS.Timeout>();
  private runningCodes = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly caseStatus: CaseStatusService,
  ) {}

  async onModuleInit() {
    await this.ensureJobs();
    for (const def of SCHEDULED_JOB_DEFS) {
      void this.execute(def.code, ScheduledJobTrigger.SYSTEM, null, 'startup');
      this.scheduleNext(def);
    }
  }

  onModuleDestroy() {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
  }

  async list() {
    await this.ensureJobs();
    const rows = await this.prisma.scheduledJob.findMany({
      orderBy: { code: 'asc' },
    });
    return rows.map((row) => this.presentJob(row));
  }

  async findOne(code: string) {
    const def = scheduledJobDef(code);
    if (!def) throw new NotFoundException('کار زمان‌بندی یافت نشد');
    await this.ensureJobs();
    const row = await this.prisma.scheduledJob.findUnique({ where: { code } });
    if (!row) throw new NotFoundException('کار زمان‌بندی یافت نشد');
    return this.presentJob(row);
  }

  async listRuns(code: string, query: PaginationQueryDto) {
    await this.findOne(code);
    const { page, pageSize, skip, take } = paginationArgs(query);
    const where = { jobCode: code };
    const [items, total] = await Promise.all([
      this.prisma.scheduledJobRun.findMany({
        where,
        orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
        skip,
        take,
        select: {
          id: true,
          jobCode: true,
          trigger: true,
          status: true,
          startedAt: true,
          finishedAt: true,
          message: true,
          detail: true,
          triggeredBy: { select: { id: true, fullName: true } },
        },
      }),
      this.prisma.scheduledJobRun.count({ where }),
    ]);
    return paginatedResult(
      items.map((item) => ({
        id: item.id,
        jobCode: item.jobCode,
        trigger: item.trigger,
        status: item.status,
        startedAt: item.startedAt.toISOString(),
        finishedAt: item.finishedAt?.toISOString() ?? null,
        message: item.message,
        detail: item.detail,
        triggeredBy: item.triggeredBy,
      })),
      total,
      page,
      pageSize,
    );
  }

  async runManual(code: string, actorId?: string) {
    return this.execute(code, ScheduledJobTrigger.MANUAL, actorId ?? null, 'manual');
  }

  private presentJob(row: {
    code: string;
    enabled: boolean;
    lastRunAt: Date | null;
    lastStatus: ScheduledJobRunStatus | null;
    lastMessage: string | null;
  }) {
    const def = scheduledJobDef(row.code);
    if (!def) {
      throw new NotFoundException('کار زمان‌بندی یافت نشد');
    }
    return {
      code: row.code,
      enabled: row.enabled,
      nameKey: def.nameKey,
      descriptionKey: def.descriptionKey,
      scheduleKey: def.scheduleKey,
      scheduleKind: def.scheduleKind,
      lastRunAt: row.lastRunAt?.toISOString() ?? null,
      lastStatus: row.lastStatus,
      lastMessage: row.lastMessage,
      running: this.runningCodes.has(row.code),
    };
  }

  private async ensureJobs() {
    for (const def of SCHEDULED_JOB_DEFS) {
      await this.prisma.scheduledJob.upsert({
        where: { code: def.code },
        update: {},
        create: { code: def.code, enabled: true },
      });
    }
  }

  private scheduleNext(def: ScheduledJobDef) {
    const prev = this.timers.get(def.code);
    if (prev) clearTimeout(prev);
    const delay = msUntilNextSchedule(def.scheduleKind);
    const timer = setTimeout(() => {
      void this.execute(def.code, ScheduledJobTrigger.SYSTEM, null, 'nightly').finally(() =>
        this.scheduleNext(def),
      );
    }, delay);
    timer.unref?.();
    this.timers.set(def.code, timer);
  }

  private async execute(
    code: string,
    trigger: ScheduledJobTrigger,
    actorId: string | null,
    reason: 'startup' | 'nightly' | 'manual',
  ) {
    const def = scheduledJobDef(code);
    if (!def) throw new NotFoundException('کار زمان‌بندی یافت نشد');
    await this.ensureJobs();
    const job = await this.prisma.scheduledJob.findUnique({ where: { code } });
    if (!job) throw new NotFoundException('کار زمان‌بندی یافت نشد');
    if (!job.enabled && trigger === ScheduledJobTrigger.SYSTEM) {
      return { skipped: true as const, reason: 'disabled' };
    }
    if (this.runningCodes.has(code)) {
      if (trigger === ScheduledJobTrigger.MANUAL) {
        throw new BadRequestException('این کار در حال اجراست');
      }
      return { skipped: true as const, reason: 'busy' };
    }

    this.runningCodes.add(code);
    const run = await this.prisma.scheduledJobRun.create({
      data: {
        jobCode: code,
        trigger,
        status: ScheduledJobRunStatus.RUNNING,
        triggeredById: actorId,
      },
    });

    try {
      const locked = await this.prisma.$queryRaw<[{ locked: boolean }]>`
        SELECT pg_try_advisory_lock(${def.lockKey}) AS locked
      `;
      if (!locked[0]?.locked) {
        await this.finishRun(run.id, code, ScheduledJobRunStatus.SKIPPED, 'اجرا رد شد؛ قفل در اختیار نمونهٔ دیگر است');
        this.logger.log(`scheduled job ${code} skipped (${reason}): lock held`);
        return { skipped: true as const, reason: 'lock' };
      }
      try {
        const result = await this.invoke(def);
        await this.finishRun(
          run.id,
          code,
          ScheduledJobRunStatus.SUCCESS,
          result.message,
          result.detail,
        );
        this.logger.log(`scheduled job ${code} ok (${reason}): ${result.message}`);
        return {
          skipped: false as const,
          status: ScheduledJobRunStatus.SUCCESS,
          message: result.message,
          detail: result.detail ?? null,
        };
      } finally {
        await this.prisma.$queryRaw`SELECT pg_advisory_unlock(${def.lockKey})`;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'خطای ناشناخته';
      await this.finishRun(run.id, code, ScheduledJobRunStatus.FAILED, message);
      this.logger.error(`scheduled job ${code} failed (${reason})`, error instanceof Error ? error.stack : error);
      if (trigger === ScheduledJobTrigger.MANUAL) throw error;
      return { skipped: false as const, status: ScheduledJobRunStatus.FAILED, message };
    } finally {
      this.runningCodes.delete(code);
    }
  }

  private async invoke(def: ScheduledJobDef): Promise<JobResult> {
    if (def.code === CASE_STATUS_SYNC_JOB) {
      const result = await this.caseStatus.syncAll();
      return {
        message: `بررسی ${result.total} پرونده؛ ${result.changed} وضعیت به‌روز شد`,
        detail: { total: result.total, changed: result.changed },
      };
    }
    throw new BadRequestException('اجراکنندهٔ این کار تعریف نشده است');
  }

  private async finishRun(
    runId: string,
    code: string,
    status: ScheduledJobRunStatus,
    message: string,
    detail?: Prisma.InputJsonValue,
  ) {
    const finishedAt = new Date();
    await this.prisma.$transaction([
      this.prisma.scheduledJobRun.update({
        where: { id: runId },
        data: {
          status,
          finishedAt,
          message,
          detail: detail ?? Prisma.JsonNull,
        },
      }),
      this.prisma.scheduledJob.update({
        where: { code },
        data: {
          lastRunAt: finishedAt,
          lastStatus: status,
          lastMessage: message,
        },
      }),
    ]);
  }
}

function msUntilNextSchedule(kind: ScheduledJobDef['scheduleKind']) {
  if (kind === 'daily-tehran-0005') {
    const today = todayIsoDateTehran();
    const nextDay = addDaysIso(today, 1);
    const nextAt = new Date(`${nextDay}T00:05:00.000+03:30`).getTime();
    return Math.max(60_000, nextAt - Date.now());
  }
  return 60_000;
}
