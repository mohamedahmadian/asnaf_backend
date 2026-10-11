import { Transform } from 'class-transformer';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

function trimString(value: unknown) {
  return typeof value === 'string' ? value.trim() : value;
}

export class LiftCaseSuspensionDto {
  @Transform(({ value }) => trimString(value))
  @IsString({ message: 'توضیحات را وارد کنید' })
  @MinLength(1, { message: 'توضیحات را وارد کنید' })
  @MaxLength(8000, { message: 'توضیحات طولانی است' })
  note: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'تاریخ پایان تعلیق معتبر نیست' })
  endsAt: string;
}
