import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { emptyToUndefined } from '../../common/dto-transform';
import { PaginationQueryDto } from '../../common/pagination';
import { sortDirections } from '../../common/sort-query';
import { paymentMethods } from './create-payment.dto';

export const paymentStatuses = ['PENDING', 'PAID', 'FAILED'] as const;

const databaseUuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const paymentSortFields = [
  'paidAt',
  'recordedBy',
  'nationalId',
  'payerName',
  'caseFile',
  'feeCount',
  'subtotal',
  'discountAmount',
  'finalAmount',
  'receiptCount',
  'receiptNumber',
  'method',
  'status',
] as const;

export class FindPaymentsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @Matches(databaseUuidPattern)
  paymentGroupId?: string;

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @Matches(databaseUuidPattern)
  bankAccountId?: string;

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
  @IsIn([...paymentMethods])
  method?: (typeof paymentMethods)[number];

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...paymentStatuses])
  status?: (typeof paymentStatuses)[number];

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn(['true', 'only'])
  deleted?: 'true' | 'only';

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...paymentSortFields])
  sortBy?: (typeof paymentSortFields)[number];

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...sortDirections])
  sortDir?: (typeof sortDirections)[number];
}
