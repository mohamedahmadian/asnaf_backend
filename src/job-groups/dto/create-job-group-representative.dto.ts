import { Transform } from 'class-transformer';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { IsIranianNationalId, normalizeNationalId } from '../../common/national-id';
import { normalizeMobile } from '../../common/phone';

export class CreateJobGroupRepresentativeDto {
  @Transform(({ value }) => (typeof value === 'string' ? normalizeNationalId(value) : value))
  @IsIranianNationalId()
  nationalId: string;

  @Transform(({ value }) => (typeof value === 'string' ? normalizeMobile(value) : value))
  @IsString()
  @Matches(/^09\d{9}$/, { message: 'شماره همراه معتبر نیست' })
  phone: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(2, { message: 'نام باید حداقل ۲ حرف باشد' })
  @MaxLength(80, { message: 'نام طولانی است' })
  firstName: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(2, { message: 'نام خانوادگی باید حداقل ۲ حرف باشد' })
  @MaxLength(80, { message: 'نام خانوادگی طولانی است' })
  lastName: string;

  @IsString()
  @MinLength(8, { message: 'رمز عبور باید حداقل ۸ کاراکتر باشد' })
  @MaxLength(72, { message: 'رمز عبور طولانی است' })
  password: string;
}
