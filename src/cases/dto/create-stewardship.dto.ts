import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { toLatinDigits } from '../../common/national-id';

function latinDigits(value: unknown) {
  return typeof value === 'string' ? toLatinDigits(value).replace(/\D/g, '') : value;
}

export class CreateStewardshipDto {
  @Transform(({ value }) => latinDigits(value))
  @IsString()
  @Matches(/^\d{10}$/, { message: 'کد ملی معتبر نیست' })
  nationalId: string;
}

export class AdvanceStewardshipDto {
  @IsInt()
  @Min(0)
  @Max(4)
  step: number;
}

export class IssueStewardshipCardDto {
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'تاریخ صدور معتبر نیست' })
  issuedAt: string;
}

export class RevokeStewardshipDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'متن درخواست را وارد کنید' })
  @MinLength(1, { message: 'متن درخواست را وارد کنید' })
  @MaxLength(8000, { message: 'متن درخواست طولانی است' })
  reason: string;

  @IsIn(['HOST', 'STEWARD'])
  source: 'HOST' | 'STEWARD';

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'تاریخ ابطال مباشرت معتبر نیست' })
  revokedAt?: string;
}
