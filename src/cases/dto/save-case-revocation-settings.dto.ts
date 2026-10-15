import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { toLatinDigits } from '../../common/national-id';

function toAmount(value: unknown) {
  if (value === '' || value == null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value !== 'string') return value;
  const digits = toLatinDigits(value).replace(/\D/g, '');
  if (!digits || digits.length > 15) return value;
  const parsed = Number(digits);
  return Number.isSafeInteger(parsed) ? parsed : value;
}

function trimString(value: unknown) {
  return typeof value === 'string' ? value.trim() : value;
}

export class RevocationOrganizationDto {
  @IsUUID('4')
  inquiryCenterId: string;

  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  letterTitle: string;

  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(1)
  @MaxLength(8000)
  letterBody: string;
}

export class SaveCaseRevocationSettingsDto {
  @Transform(({ value }) => toAmount(value))
  @IsInt()
  @Min(0)
  @Max(9_007_199_254_740_991)
  fixedAmount: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RevocationOrganizationDto)
  organizations: RevocationOrganizationDto[];
}
