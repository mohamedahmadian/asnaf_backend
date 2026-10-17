import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import {
  IsIranianCardNumber,
  IsIranianIban,
  normalizeAccountNumber,
  normalizeCardNumber,
  normalizeIban,
} from '../../common/bank-account';
import { emptyToNull } from '../../common/dto-transform';
import { toLatinDigits } from '../../common/national-id';

function trimString(value: unknown) {
  return typeof value === 'string' ? value.trim() : value;
}

function optionalNormalized(
  value: unknown,
  normalize: (input: string) => string,
) {
  if (typeof value !== 'string') {
    return emptyToNull(value);
  }
  const normalized = normalize(value);
  return normalized || null;
}

function normalizePaymentId(value: unknown) {
  if (typeof value !== 'string') {
    return emptyToNull(value);
  }
  const digits = toLatinDigits(value).replace(/\D/g, '');
  return digits || null;
}

export class CreateBankAccountDto {
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  bankName: string;

  @Transform(({ value }) =>
    typeof value === 'string' ? normalizeAccountNumber(value) : value,
  )
  @IsString()
  @Matches(/^\d{6,20}$/, { message: 'شماره حساب معتبر نیست' })
  accountNumber: string;

  @IsOptional()
  @Transform(({ value }) => optionalNormalized(value, normalizeCardNumber))
  @ValidateIf((_, value) => value != null)
  @IsString()
  @IsIranianCardNumber()
  cardNumber?: string | null;

  @IsOptional()
  @Transform(({ value }) => optionalNormalized(value, normalizeIban))
  @ValidateIf((_, value) => value != null)
  @IsString()
  @IsIranianIban()
  iban?: string | null;

  @IsOptional()
  @Transform(({ value }) => normalizePaymentId(value))
  @ValidateIf((_, value) => value != null)
  @IsString()
  @MaxLength(100)
  @Matches(/^\d+$/)
  paymentId?: string | null;

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
