import { Transform } from 'class-transformer';
import {
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { emptyToNull } from '../../common/dto-transform';
import { toLatinDigits } from '../../common/national-id';

function trimString(value: unknown) {
  return typeof value === 'string' ? value.trim() : value;
}

function normalizePaymentId(value: unknown) {
  return typeof value === 'string' ? toLatinDigits(value).trim() : value;
}

export class CreateFinancialHeadingDto {
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

  @Transform(({ value }) => trimString(value))
  @IsUUID()
  bankAccountId: string;

  @Transform(({ value }) => normalizePaymentId(value))
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @Matches(/^\d+$/)
  paymentId: string;
}
