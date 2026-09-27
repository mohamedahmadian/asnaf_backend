import { Transform } from 'class-transformer';
import {
  IsArray,
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

function toOptionalFee(value: unknown) {
  if (value === '' || value === undefined || value === null) {
    return null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (typeof value !== 'string') {
    return value;
  }
  const digits = toLatinDigits(value).replace(/\D/g, '');
  if (!digits) {
    return null;
  }
  return Number(digits);
}

export class CreateJobCatalogDto {
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  title: string;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(trimString(value)))
  @ValidateIf((_, value) => value != null)
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  titleEn?: string | null;

  @IsUUID()
  jobTypeId: string;

  @IsOptional()
  @Transform(({ value }) => toOptionalFee(value))
  @ValidateIf((_, value) => value != null)
  @IsInt()
  @Min(0)
  @Max(9_007_199_254_740_991)
  annualFee?: number | null;

  @IsUUID()
  groupId: string;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(trimString(value)))
  @ValidateIf((_, value) => value != null)
  @IsString()
  @MaxLength(32)
  taxIntaCode?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  inquiryCenterIds?: string[];

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  documentIds?: string[];
}
