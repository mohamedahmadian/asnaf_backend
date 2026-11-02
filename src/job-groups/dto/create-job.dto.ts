import { Transform } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { emptyToNull } from '../../common/dto-transform';

function trimString(value: unknown) {
  return typeof value === 'string' ? value.trim() : value;
}

function normalizeOptionalLink(value: unknown) {
  const trimmed = emptyToNull(trimString(value));
  if (trimmed == null) return null;
  if (typeof trimmed !== 'string') return trimmed;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export class CreateJobDto {
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  title: string;

  @IsOptional()
  @Transform(({ value }) => trimString(value))
  @ValidateIf((_, value) => value != null && value !== '')
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  titleEn?: string;

  @IsUUID()
  jobTypeId: string;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(trimString(value)))
  @ValidateIf((_, value) => value != null)
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @IsOptional()
  @Transform(({ value }) => normalizeOptionalLink(value))
  @ValidateIf((_, value) => value != null)
  @IsString()
  @MaxLength(500)
  @Matches(/^https?:\/\/.+/i, { message: 'لینک ویدئو معتبر نیست' })
  videoUrl?: string | null;

  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  code: string;

  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  taxIntaCode: string;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  inquiryCenterIds?: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
