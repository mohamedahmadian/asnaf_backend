import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
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

function toYear(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (typeof value !== 'string') {
    return value;
  }
  const digits = toLatinDigits(value).replace(/\D/g, '');
  if (!digits) {
    return value;
  }
  return Number(digits);
}

function toPercent(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value !== 'string') {
    return value;
  }
  const normalized = toLatinDigits(value).trim().replace(/,/g, '.');
  if (!normalized) {
    return value;
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : value;
}

export class CreateDiscountDto {
  @Transform(({ value }) => toYear(value))
  @Type(() => Number)
  @IsInt()
  @Min(1300)
  @Max(1600)
  year: number;

  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  title: string;

  @Transform(({ value }) => toPercent(value))
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  percent: number;

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
