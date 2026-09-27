import { Transform } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';
import { toLatinDigits } from '../../common/national-id';

function toRequiredFee(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (typeof value !== 'string') {
    return value;
  }
  const digits = toLatinDigits(value).replace(/\D/g, '');
  if (!digits) {
    return value;
  }
  return Number(digits);
}

export class ApplyJobsAnnualFeeDto {
  @Transform(({ value }) => toRequiredFee(value))
  @IsInt()
  @Min(0)
  @Max(9_007_199_254_740_991)
  annualFee: number;
}
