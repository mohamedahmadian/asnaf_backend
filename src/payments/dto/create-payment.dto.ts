import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { emptyToNull } from '../../common/dto-transform';
import { toLatinDigits } from '../../common/national-id';

const databaseUuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const paymentDiscountModes = ['MANUAL', 'CATALOG'] as const;
export const paymentMethods = ['ONLINE', 'POS', 'BANK_RECEIPT'] as const;
export const onlineChannels = ['OPERATOR', 'PUBLIC_LINK'] as const;

function trimString(value: unknown) {
  return typeof value === 'string' ? value.trim() : value;
}

function toAmount(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (typeof value !== 'string') {
    return value;
  }
  const digits = toLatinDigits(value).replace(/\D/g, '');
  if (!digits || digits.length > 15) {
    return value;
  }
  const parsed = Number(digits);
  return Number.isSafeInteger(parsed) ? parsed : value;
}

export class CreatePaymentLineDto {
  @Transform(({ value }) => trimString(value))
  @Matches(databaseUuidPattern)
  municipalFeeId: string;

  @Transform(({ value }) => toAmount(value))
  @IsInt()
  @Min(0)
  @Max(9_007_199_254_740_991)
  amount: number;

  @IsBoolean()
  included: boolean;
}

export class CreatePaymentDto {
  @Transform(({ value }) => trimString(value))
  @Matches(databaseUuidPattern)
  payerUserId: string;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(trimString(value)))
  @ValidateIf((_, value) => value != null)
  @Matches(databaseUuidPattern)
  caseFileId?: string | null;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(trimString(value)))
  @ValidateIf((_, value) => value != null)
  @Matches(databaseUuidPattern)
  caseRequestId?: string | null;

  @IsIn([...paymentMethods])
  method: (typeof paymentMethods)[number];

  @ValidateIf((dto: CreatePaymentDto) => dto.method === 'ONLINE')
  @IsIn([...onlineChannels])
  onlineChannel?: (typeof onlineChannels)[number];

  @ValidateIf((dto: CreatePaymentDto) => dto.method !== 'ONLINE')
  @Transform(({ value }) => {
    const trimmed = trimString(value);
    return typeof trimmed === 'string' ? toLatinDigits(trimmed) : trimmed;
  })
  @IsString()
  @Matches(/^[0-9A-Za-z-]{4,40}$/, { message: 'شماره پیگیری نامعتبر است' })
  trackingCode?: string;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(trimString(value)))
  @ValidateIf((_, value) => value != null)
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(trimString(value)))
  @ValidateIf((_, value) => value != null)
  @Matches(databaseUuidPattern)
  paymentGroupId?: string | null;

  @Transform(({ value }) => trimString(value))
  @Matches(databaseUuidPattern)
  bankAccountId: string;

  @IsIn([...paymentDiscountModes])
  discountMode: (typeof paymentDiscountModes)[number];

  @IsOptional()
  @Transform(({ value }) => emptyToNull(trimString(value)))
  @ValidateIf((_, value) => value != null)
  @Matches(databaseUuidPattern)
  discountId?: string | null;

  @Transform(({ value }) => toAmount(value))
  @IsInt()
  @Min(0)
  @Max(9_007_199_254_740_991)
  discountAmount: number;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreatePaymentLineDto)
  lines: CreatePaymentLineDto[];
}
