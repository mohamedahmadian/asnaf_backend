import { Transform } from 'class-transformer';
import {
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
import { normalizePhone } from '../../common/phone';

function trimString(value: unknown) {
  return typeof value === 'string' ? value.trim() : value;
}

function optionalPhone(value: unknown) {
  if (typeof value !== 'string') {
    return emptyToNull(value);
  }
  const digits = normalizePhone(value).replace(/\D/g, '');
  return digits || null;
}

export class CreateInquiryCenterDto {
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name: string;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(trimString(value)))
  @ValidateIf((_, value) => value != null)
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @IsOptional()
  @Transform(({ value }) => optionalPhone(value))
  @ValidateIf((_, value) => value != null)
  @IsString()
  @Matches(/^\d{8,15}$/, { message: 'شماره تلفن معتبر نیست' })
  phone?: string | null;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(value))
  @ValidateIf((_, value) => value != null)
  @IsUUID()
  officerId?: string | null;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(trimString(value)))
  @ValidateIf((_, value) => value != null)
  @IsString()
  @MaxLength(200)
  letterTitle?: string | null;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(trimString(value)))
  @ValidateIf((_, value) => value != null)
  @IsString()
  @MaxLength(20000)
  letterBody?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
