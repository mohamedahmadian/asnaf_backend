import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';

function trimString(value: unknown) {
  return typeof value === 'string' ? value.trim() : value;
}

export class RevokeCaseDto {
  @Transform(({ value }) => trimString(value))
  @IsString({ message: 'علت ابطال را وارد کنید' })
  @MinLength(1, { message: 'علت ابطال را وارد کنید' })
  @MaxLength(2000, { message: 'علت ابطال طولانی است' })
  reason: string;
}
