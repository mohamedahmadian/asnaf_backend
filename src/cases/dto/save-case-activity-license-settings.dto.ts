import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsUUID, MaxLength, ValidateIf } from 'class-validator';

function emptyToNull({ value }: { value: unknown }) {
  if (value == null) return null;
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export class SaveCaseActivityLicenseSettingsDto {
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
  signatureId?: string | null;
}
