import { Transform } from 'class-transformer';
import {
  IsOptional,
  IsString,
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

export class CreateDocumentDto {
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  title: string;

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
  @Matches(/^https?:\/\/.+/i, { message: 'لینک معتبر نیست' })
  link?: string | null;
}
