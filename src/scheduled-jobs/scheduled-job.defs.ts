export const CASE_STATUS_SYNC_JOB = 'case-status-sync';

export type ScheduledJobScheduleKind = 'daily-tehran-0005';

export type ScheduledJobDef = {
  code: string;
  nameKey: string;
  descriptionKey: string;
  scheduleKey: string;
  scheduleKind: ScheduledJobScheduleKind;
  /** قفل advisory اختصاصی این کار */
  lockKey: number;
};

export const SCHEDULED_JOB_DEFS: ScheduledJobDef[] = [
  {
    code: CASE_STATUS_SYNC_JOB,
    nameKey: 'schedules.jobs.caseStatusSync.name',
    descriptionKey: 'schedules.jobs.caseStatusSync.description',
    scheduleKey: 'schedules.jobs.caseStatusSync.schedule',
    scheduleKind: 'daily-tehran-0005',
    lockKey: 917_001_117,
  },
];

export function scheduledJobDef(code: string) {
  return SCHEDULED_JOB_DEFS.find((item) => item.code === code) ?? null;
}
