import { Transform } from 'class-transformer';
import { IsEnum, IsIn, IsOptional } from 'class-validator';
import { emptyToUndefined } from '../../common/dto-transform';
import { PaginationQueryDto } from '../../common/pagination';
import { sortDirections } from '../../common/sort-query';
import { CaseInquiryStatus } from '../../generated/prisma/client';

export const managementReviewViews = ['referred', 'decided', 'reviewing', 'overdue'] as const;

export type ManagementReviewView = (typeof managementReviewViews)[number];

export const managementReviewSortFields = [
  'applicant',
  'nationalId',
  'job',
  'requestType',
  'status',
  'createdAt',
] as const;

export class FindManagementReviewsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsEnum(CaseInquiryStatus)
  status?: CaseInquiryStatus;

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...managementReviewViews])
  view?: ManagementReviewView;

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...managementReviewSortFields])
  sortBy?: (typeof managementReviewSortFields)[number];

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...sortDirections])
  sortDir?: (typeof sortDirections)[number];
}
