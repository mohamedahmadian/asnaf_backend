import { Transform } from 'class-transformer';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

function trimString(value: unknown) {
  return typeof value === 'string' ? value.trim() : value;
}

export class SuspendCaseDto {
  @Transform(({ value }) => trimString(value))
  @IsString({ message: 'علت تعلیق را وارد کنید' })
  @MinLength(1, { message: 'علت تعلیق را وارد کنید' })
  @MaxLength(8000, { message: 'علت تعلیق طولانی است' })
  reason: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'تاریخ شروع تعلیق معتبر نیست' })
  startsAt: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'تاریخ پایان تعلیق معتبر نیست' })
  endsAt: string;
}
