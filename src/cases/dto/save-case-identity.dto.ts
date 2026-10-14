import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { emptyToNull } from '../../common/dto-transform';
import { IsIranianNationalId, normalizeNationalId } from '../../common/national-id';
import { normalizePhone } from '../../common/phone';
import { EducationLevel, Religion, ResidencyStatus, UserGender } from '../../generated/prisma/client';

function dateOrNull(value: unknown) {
  const trimmed = emptyToNull(value);
  return trimmed;
}

export class SaveCaseIdentityDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? normalizeNationalId(value) : value,
  )
  @IsIranianNationalId()
  nationalId: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'نام را وارد کنید' })
  @MinLength(1, { message: 'نام را وارد کنید' })
  firstName: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'نام خانوادگی را وارد کنید' })
  @MinLength(1, { message: 'نام خانوادگی را وارد کنید' })
  lastName: string;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(value))
  @ValidateIf((_, value) => value != null)
  @IsString({ message: 'نام پدر معتبر نیست' })
  fatherName?: string | null;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(value))
  @ValidateIf((_, value) => value != null)
  @IsString({ message: 'نام خانوادگی لاتین معتبر نیست' })
  lastNameEn?: string | null;

  @IsOptional()
  @Transform(({ value }) => dateOrNull(value))
  @ValidateIf((_, value) => value != null)
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'تاریخ تولد معتبر نیست' })
  birthDate?: string | null;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(value))
  @ValidateIf((_, value) => value != null)
  @IsEnum(ResidencyStatus, { message: 'وضعیت اقامت معتبر نیست' })
  residencyStatus?: ResidencyStatus | null;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(value))
  @ValidateIf((_, value) => value != null)
  @IsString({ message: 'شماره گذرنامه معتبر نیست' })
  passportNumber?: string | null;

  @IsOptional()
  @Transform(({ value }) => dateOrNull(value))
  @ValidateIf((_, value) => value != null)
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'تاریخ انقضای کارت ملی معتبر نیست' })
  nationalCardExpiresAt?: string | null;

  @IsOptional()
  @Transform(({ value }) => dateOrNull(value))
  @ValidateIf((_, value) => value != null)
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'تاریخ انقضای گذرنامه معتبر نیست' })
  passportExpiresAt?: string | null;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(value))
  @ValidateIf((_, value) => value != null)
  @IsString({ message: 'شماره شناسنامه معتبر نیست' })
  identityCertificateNo?: string | null;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(value))
  @ValidateIf((_, value) => value != null)
  @IsString({ message: 'محل تولد معتبر نیست' })
  birthPlace?: string | null;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(value))
  @ValidateIf((_, value) => value != null)
  @IsString({ message: 'محل صدور شناسنامه معتبر نیست' })
  identityIssuedIn?: string | null;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(value))
  @ValidateIf((_, value) => value != null)
  @IsUUID('4', { message: 'ملیت معتبر نیست' })
  countryId?: string | null;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? normalizePhone(value) || null : emptyToNull(value),
  )
  @ValidateIf((_, value) => value != null)
  @IsString({ message: 'تلفن همراه معتبر نیست' })
  phone?: string | null;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? normalizePhone(value) || null : emptyToNull(value),
  )
  @ValidateIf((_, value) => value != null)
  @IsString({ message: 'تلفن ثابت معتبر نیست' })
  homePhone?: string | null;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(value))
  @ValidateIf((_, value) => value != null)
  @IsString({ message: 'کد پستی معتبر نیست' })
  postalCode?: string | null;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(value))
  @ValidateIf((_, value) => value != null)
  @IsString({ message: 'نشانی معتبر نیست' })
  address?: string | null;

  @IsOptional()
  @Transform(({ value }) => {
    const trimmed = typeof value === 'string' ? value.trim().toLowerCase() : emptyToNull(value);
    return trimmed || null;
  })
  @ValidateIf((_, value) => value != null)
  @IsEmail({}, { message: 'ایمیل معتبر نیست' })
  email?: string | null;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(value))
  @ValidateIf((_, value) => value != null)
  @IsEnum(EducationLevel, { message: 'سطح تحصیلات معتبر نیست' })
  educationLevel?: EducationLevel | null;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(value))
  @ValidateIf((_, value) => value != null)
  @IsString({ message: 'گروه شغلی معتبر نیست' })
  citizenGroup?: string | null;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(value))
  @ValidateIf((_, value) => value != null)
  @IsUUID('4', { message: 'شغل معتبر نیست' })
  jobId?: string | null;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(value))
  @ValidateIf((_, value) => value != null)
  @IsEnum(Religion, { message: 'دین معتبر نیست' })
  religion?: Religion | null;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(value))
  @ValidateIf((_, value) => value != null)
  @IsString({ message: 'دین معتبر نیست' })
  religionOther?: string | null;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(value))
  @ValidateIf((_, value) => value != null)
  @IsEnum(UserGender, { message: 'جنسیت معتبر نیست' })
  gender?: UserGender | null;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(value))
  @ValidateIf((_, value) => value != null)
  @IsUUID('4', { message: 'پرونده معتبر نیست' })
  caseId?: string | null;

  @IsOptional()
  @IsBoolean()
  startNew?: boolean;
}
