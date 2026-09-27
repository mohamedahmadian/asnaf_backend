import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { emptyToNull } from '../../common/dto-transform';
import { toLatinDigits } from '../../common/national-id';

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

export class CreateMunicipalFeeDto {
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  title: string;

  @Transform(({ value }) => trimString(value))
  @IsUUID()
  bankAccountId: string;

  @Transform(({ value }) => toAmount(value))
  @IsInt()
  @Min(0)
  @Max(9_007_199_254_740_991)
  amount: number;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(trimString(value)))
  @ValidateIf((_, value) => value != null)
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
