import { Transform, Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsInt,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { toLatinDigits } from '../../common/national-id';

const databaseUuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toAmount(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (typeof value !== 'string') {
    return value;
  }
  const digits = toLatinDigits(value).replace(/\D/g, '');
  if (!digits || digits.length > 15) {
    return value;
  }
  const parsed = Number(digits);
  return Number.isSafeInteger(parsed) ? parsed : value;
}

export class CaseRequestFeeLineDto {
  @Matches(databaseUuidPattern)
  municipalFeeId: string;

  @Transform(({ value }) => toAmount(value))
  @IsInt()
  @Min(0)
  @Max(9_007_199_254_740_991)
  amount: number;
}

export class SaveCaseRequestFeesDto {
  @IsArray()
  @ArrayUnique((line: CaseRequestFeeLineDto) => line.municipalFeeId)
  @ValidateNested({ each: true })
  @Type(() => CaseRequestFeeLineDto)
  fees: CaseRequestFeeLineDto[];
}
