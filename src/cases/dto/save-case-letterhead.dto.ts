import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength, ValidateIf } from 'class-validator';

function emptyToNull({ value }: { value: unknown }) {
  if (value == null) return null;
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export class SaveCaseLetterheadDto {
  @Transform(emptyToNull)
  @ValidateIf((_, value) => value != null)
  @IsString()
  @MaxLength(200)
  organizationName?: string | null;

  @Transform(emptyToNull)
  @ValidateIf((_, value) => value != null)
  @IsString()
  @MaxLength(2000)
  address?: string | null;

  @Transform(emptyToNull)
  @ValidateIf((_, value) => value != null)
  @IsString()
  @MaxLength(30)
  phone?: string | null;

  @Transform(emptyToNull)
  @ValidateIf((_, value) => value != null)
  @IsString()
  @MaxLength(300)
  website?: string | null;

  @Transform(emptyToNull)
  @ValidateIf((_, value) => value != null)
  @IsString()
  @MaxLength(120)
  signerName?: string | null;

  @Transform(emptyToNull)
  @ValidateIf((_, value) => value != null)
  @IsString()
  @MaxLength(120)
  signerTitle?: string | null;

  @IsOptional()
  @Transform(({ value }) => (value === '' || value == null ? null : value))
  @ValidateIf((_, value) => value != null)
  @IsUUID('4')
  logoId?: string | null;

  @IsOptional()
  @Transform(({ value }) => (value === '' || value == null ? null : value))
  @ValidateIf((_, value) => value != null)
  @IsUUID('4')
  signatureId?: string | null;

  @Transform(emptyToNull)
  @ValidateIf((_, value) => value != null)
  @IsString()
  @MaxLength(20000)
  defaultLetterBody?: string | null;

  @IsOptional()
  @IsIn(['A4', 'A5'])
  defaultPaper?: 'A4' | 'A5';
}
