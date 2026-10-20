import { Transform } from 'class-transformer';
import {
  ArrayUnique,
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
  MinLength,
  ValidateIf,
} from 'class-validator';
import { emptyToNull } from '../../common/dto-transform';
import { CaseRequestType, MunicipalFeeCalcKind } from '../../generated/prisma/client';
import { municipalFeeCalcKinds } from '../../case-finance/fee-calculator';
import { toLatinDigits } from '../../common/national-id';

const databaseUuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

export const municipalFeeProcessTypes = [
  CaseRequestType.ISSUANCE,
  CaseRequestType.RENEWAL,
  CaseRequestType.LOCATION_CHANGE,
  CaseRequestType.AUCTION,
  CaseRequestType.STEWARDSHIP,
] as const;

export class CreateMunicipalFeeDto {
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  title: string;

  @Transform(({ value }) => trimString(value))
  @Matches(databaseUuidPattern)
  bankAccountId: string;

  @IsOptional()
  @IsIn([...municipalFeeCalcKinds])
  calcKind?: MunicipalFeeCalcKind;

  @IsOptional()
  @Transform(({ value }) => toAmount(value))
  @ValidateIf((_, value) => value != null)
  @IsInt()
  @Min(0)
  @Max(9_007_199_254_740_991)
  amount?: number;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(trimString(value)))
  @ValidateIf((_, value) => value != null)
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn([...municipalFeeProcessTypes], { each: true })
  processTypes?: (typeof municipalFeeProcessTypes)[number][];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
