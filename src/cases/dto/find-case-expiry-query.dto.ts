import { Transform } from 'class-transformer';
import { IsIn, IsOptional } from 'class-validator';
import { emptyToUndefined } from '../../common/dto-transform';
import { PaginationQueryDto } from '../../common/pagination';
import { sortDirections } from '../../common/sort-query';

export const caseExpirySortFields = [
  'fullName',
  'licenseNumber',
  'kind',
  'status',
  'job',
  'jobTitle',
  'issuedAt',
  'expiresAt',
] as const;

export type CaseExpirySortField = (typeof caseExpirySortFields)[number];

export class FindCaseExpiryQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...caseExpirySortFields])
  sortBy?: CaseExpirySortField;

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...sortDirections])
  sortDir?: (typeof sortDirections)[number];
}
