import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { emptyToNull, emptyToUndefined } from '../../common/dto-transform';
import { normalizePhone } from '../../common/phone';

function trimToNull(value: unknown) {
  if (typeof value !== 'string') {
    return emptyToNull(value);
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function digitsToNull(value: unknown) {
  if (typeof value !== 'string') {
    return emptyToNull(value);
  }
  const digits = normalizePhone(value).replace(/\D/g, '');
  return digits.length ? digits : null;
}

export class UpdateSmsSettingsDto {
  @IsBoolean()
  isActive: boolean;

  @IsOptional()
  @Transform(({ value }) => trimToNull(value))
  @ValidateIf((_, value) => value != null)
  @IsString()
  @MaxLength(500)
  endpoint?: string | null;

  @IsOptional()
  @Transform(({ value }) => digitsToNull(value))
  @ValidateIf((_, value) => value != null)
  @IsString()
  @MaxLength(20)
  senderNumber?: string | null;

  @IsOptional()
  @Transform(({ value }) => trimToNull(value))
  @ValidateIf((_, value) => value != null)
  @IsString()
  @MaxLength(120)
  username?: string | null;

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  password?: string;
}
