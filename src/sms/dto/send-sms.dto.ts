import { Transform } from 'class-transformer';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { normalizeMobile } from '../../common/phone';

export class SendSmsDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? normalizeMobile(value) : value,
  )
  @IsString()
  @Matches(/^09\d{9}$/, { message: 'شماره تلفن همراه معتبر نیست' })
  phone: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1, { message: 'متن پیامک را وارد کنید' })
  @MaxLength(1000)
  body: string;
}
