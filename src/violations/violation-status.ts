export const violationStatuses = [
  'REGISTERED',
  'UNDER_REVIEW',
  'NOTICE',
  'REFERRED',
  'VERDICT_ISSUED',
  'CLOSED',
  'DISMISSED',
] as const;

export type ViolationStatusCode = (typeof violationStatuses)[number];
