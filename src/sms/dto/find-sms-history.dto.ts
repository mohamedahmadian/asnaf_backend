import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { emptyToUndefined } from '../../common/dto-transform';
import { PaginationQueryDto } from '../../common/pagination';
import { sortDirections } from '../../common/sort-query';

export const smsMessageStatuses = ['SKIPPED', 'SENT', 'FAILED'] as const;
export const smsMessageSources = [
  'MANUAL',
  'PASSWORD',
  'PAYMENT_LINK',
  'STEWARDSHIP',
] as const;
export const smsHistorySortFields = ['createdAt', 'phone', 'status'] as const;

export class FindSmsHistoryQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...smsMessageStatuses])
  status?: (typeof smsMessageStatuses)[number];

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...smsMessageSources])
  source?: (typeof smsMessageSources)[number];

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsString()
  @MinLength(10)
  @MaxLength(10)
  from?: string;

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsString()
  @MinLength(10)
  @MaxLength(10)
  to?: string;

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...smsHistorySortFields])
  sortBy?: (typeof smsHistorySortFields)[number];

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...sortDirections])
  sortDir?: (typeof sortDirections)[number];
}
