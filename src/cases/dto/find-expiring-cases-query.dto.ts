import { Transform } from 'class-transformer';
import { IsEnum, IsIn, IsOptional, IsUUID } from 'class-validator';
import { emptyToUndefined } from '../../common/dto-transform';
import { PaginationQueryDto } from '../../common/pagination';
import { sortDirections } from '../../common/sort-query';
import { CaseFileStatus } from '../../generated/prisma/client';
import { expiringRanges } from '../expiring-range';
import { caseKindFilters, type CaseKindFilter } from './find-cases-query.dto';

export const expiringCaseSortFields = [
  'licenseNumber',
  'fullName',
  'nationalId',
  'job',
  'jobTitle',
  'expiresAt',
  'daysRemaining',
] as const;

export type ExpiringCaseSortField = (typeof expiringCaseSortFields)[number];

export class FindExpiringCasesQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...expiringRanges])
  range?: (typeof expiringRanges)[number];

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsEnum(CaseFileStatus)
  status?: CaseFileStatus;

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsUUID()
  jobId?: string;

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsUUID()
  jobGroupId?: string;

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...caseKindFilters])
  caseKind?: CaseKindFilter;

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...expiringCaseSortFields])
  sortBy?: ExpiringCaseSortField;

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...sortDirections])
  sortDir?: (typeof sortDirections)[number];
}
