import { Transform } from 'class-transformer';
import { IsString, Matches, MinLength } from 'class-validator';
import { IsIranianNationalId, normalizeNationalId, toLatinDigits } from '../../common/national-id';
import { normalizeMobile } from '../../common/phone';

export class RegisterUserDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  firstName: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  lastName: string;

  @Transform(({ value }) => (typeof value === 'string' ? normalizeMobile(value) : value))
  @Matches(/^09\d{9}$/, { message: 'شماره همراه معتبر نیست' })
  phone: string;

  @Transform(({ value }) => (typeof value === 'string' ? normalizeNationalId(value) : value))
  @IsIranianNationalId()
  nationalId: string;

  @Transform(({ value }) => (typeof value === 'string' ? toLatinDigits(value) : value))
  @IsString()
  @MinLength(8, { message: 'رمز عبور باید حداقل ۸ کاراکتر باشد' })
  password: string;
}
