import { Transform } from 'class-transformer';
import { IsInt, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { toLatinDigits } from '../../common/national-id';

function toAmount(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value !== 'string') return value;
  const digits = toLatinDigits(value).replace(/\D/g, '');
  const parsed = Number(digits);
  return digits && Number.isSafeInteger(parsed) ? parsed : value;
}

function trimString(value: unknown) {
  return typeof value === 'string' ? value.trim() : value;
}

export class SaveCaseRevocationAmountDto {
  @Transform(({ value }) => toAmount(value))
  @IsInt()
  @Min(0)
  @Max(9_007_199_254_740_991)
  amount: number;
}

export class CompleteCaseRevocationDto {
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(1, { message: 'علت ابطال را وارد کنید' })
  @MaxLength(2000, { message: 'علت ابطال طولانی است' })
  reason: string;

  @Transform(({ value }) => toLatinDigits(String(value ?? '')).trim())
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'تاریخ ابطال معتبر نیست' })
  revokedAt: string;
}
