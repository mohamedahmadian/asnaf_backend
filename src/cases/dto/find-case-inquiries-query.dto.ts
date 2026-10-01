import { Transform } from 'class-transformer';
import { IsEnum, IsIn, IsOptional } from 'class-validator';
import { emptyToUndefined } from '../../common/dto-transform';
import { PaginationQueryDto } from '../../common/pagination';
import { sortDirections } from '../../common/sort-query';
import { CaseInquiryStatus } from '../../generated/prisma/client';

export const caseInquirySortFields = ['applicant', 'nationalId', 'center', 'job', 'status', 'createdAt'] as const;
export type CaseInquirySortField = (typeof caseInquirySortFields)[number];

export class FindCaseInquiriesQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsEnum(CaseInquiryStatus)
  status?: CaseInquiryStatus;

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...caseInquirySortFields])
  sortBy?: CaseInquirySortField;

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...sortDirections])
  sortDir?: (typeof sortDirections)[number];
}
