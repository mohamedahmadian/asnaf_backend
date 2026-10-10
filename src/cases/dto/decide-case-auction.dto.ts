import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';
import { emptyToNull } from '../../common/dto-transform';

function trimString(value: unknown) {
  return typeof value === 'string' ? value.trim() : value;
}

export class DecideCaseAuctionDto {
  @IsIn(['APPROVED', 'REJECTED'], { message: 'نتیجه تایید معتبر نیست' })
  status: 'APPROVED' | 'REJECTED';

  @IsOptional()
  @Transform(({ value }) => emptyToNull(trimString(value)))
  @ValidateIf((_, value) => value != null)
  @IsString()
  @MaxLength(2000, { message: 'توضیحات طولانی است' })
  note?: string | null;
}
