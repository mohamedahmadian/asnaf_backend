import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  caseStatusToday,
  syncAllCaseStatuses,
  syncCaseStatus,
  type CaseStatusToday,
} from './case-status';

/** همگام‌سازی وضعیت پرونده؛ زمان‌بندی و تاریخچه در ScheduledJobsService است. */
@Injectable()
export class CaseStatusService {
  constructor(private readonly prisma: PrismaService) {}

  async sync(caseFileId: string, today: CaseStatusToday = caseStatusToday()) {
    return syncCaseStatus(this.prisma, caseFileId, today);
  }

  async syncAll(today: CaseStatusToday = caseStatusToday()) {
    return syncAllCaseStatuses(this.prisma, today);
  }
}
