import { Transform } from 'class-transformer';
import {
  IsArray,
  IsEmail,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { PersonType, Religion, UserGender, UserStatus } from '../../generated/prisma/client';
import { emptyToNull } from '../../common/dto-transform';
import { normalizeNationalId, toLatinDigits } from '../../common/national-id';
import { normalizePhone } from '../../common/phone';

function digitsOrNull(value: unknown, max: number) {
  if (typeof value !== 'string') return emptyToNull(value);
  const digits = toLatinDigits(value).replace(/\D/g, '').slice(0, max);
  return digits || null;
}

export const APP_LOCALES = ['fa', 'ar', 'ur', 'hi', 'en'] as const;

export class CreateUserDto {
  @IsString()
  @MinLength(3)
  username: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsString()
  @MinLength(1)
  firstName: string;

  @IsString()
  @MinLength(1)
  lastName: string;

  @IsOptional()
  @IsIn([...APP_LOCALES])
  locale?: string;

  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(value))
  @ValidateIf((_, value) => value != null)
  @IsEnum(UserGender)
  gender?: UserGender | null;

  @IsOptional()
  @IsEnum(PersonType)
  personType?: PersonType;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(value))
  @ValidateIf((_, value) => value != null)
  @IsString()
  companyName?: string | null;

  @IsOptional()
  @Transform(({ value }) => digitsOrNull(value, 11))
  @ValidateIf((_, value) => value != null)
  @Matches(/^\d{11}$/, { message: 'شناسه ملی باید ۱۱ رقم باشد' })
  companyNationalId?: string | null;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(value))
  @ValidateIf((_, value) => value != null)
  @IsString()
  companyRegistrationNo?: string | null;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(value))
  @ValidateIf((_, value) => value != null)
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'تاریخ ثبت معتبر نیست' })
  companyRegisteredAt?: string | null;

  @IsOptional()
  @Transform(({ value }) => digitsOrNull(value, 14))
  @ValidateIf((_, value) => value != null)
  @Matches(/^\d{1,14}$/, { message: 'کد اقتصادی معتبر نیست' })
  economicCode?: string | null;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? normalizeNationalId(value) || null : emptyToNull(value),
  )
  @ValidateIf((_, value) => value != null)
  @IsString()
  nationalId?: string | null;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? normalizePhone(value) || null : emptyToNull(value),
  )
  @ValidateIf((_, value) => value != null)
  @IsString()
  phone?: string | null;

  @IsOptional()
  @Transform(({ value }) => {
    const trimmed = typeof value === 'string' ? value.trim().toLowerCase() : emptyToNull(value);
    return trimmed || null;
  })
  @ValidateIf((_, value) => value != null)
  @IsEmail()
  email?: string | null;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(value))
  @ValidateIf((_, value) => value != null)
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'تاریخ تولد معتبر نیست' })
  birthDate?: string | null;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(value))
  @ValidateIf((_, value) => value != null)
  @IsString()
  address?: string | null;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(value))
  @ValidateIf((_, value) => value != null)
  @IsString()
  notes?: string | null;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(value))
  @ValidateIf((_, value) => value != null)
  @IsEnum(Religion)
  religion?: Religion | null;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(value))
  @ValidateIf((_, value) => value != null)
  @IsString()
  religionOther?: string | null;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(value))
  @ValidateIf((_, value) => value != null)
  @IsString()
  telegram?: string | null;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(value))
  @ValidateIf((_, value) => value != null)
  @IsString()
  bale?: string | null;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(value))
  @ValidateIf((_, value) => value != null)
  @IsString()
  eitaa?: string | null;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(value))
  @ValidateIf((_, value) => value != null)
  @IsString()
  whatsapp?: string | null;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(value))
  @ValidateIf((_, value) => value != null)
  @IsString()
  otherSocial?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  vehiclePlates?: string[];

  @IsOptional()
  @Transform(({ value }) => emptyToNull(value))
  @ValidateIf((_, value) => value != null)
  @IsUUID('4')
  countryId?: string | null;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(value))
  @ValidateIf((_, value) => value != null)
  @IsUUID('4')
  provinceId?: string | null;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(value))
  @ValidateIf((_, value) => value != null)
  @IsUUID('4')
  cityId?: string | null;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(value))
  @ValidateIf((_, value) => value != null)
  @IsUUID('4')
  photoId?: string | null;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(value))
  @ValidateIf((_, value) => value != null)
  @IsUUID('4')
  orgUnitId?: string | null;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(value))
  @ValidateIf((_, value) => value != null)
  @IsUUID('4')
  positionId?: string | null;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(value))
  @ValidateIf((_, value) => value != null)
  @IsUUID('4')
  workUnitId?: string | null;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(value))
  @ValidateIf((_, value) => value != null)
  @IsUUID('4')
  staffPostId?: string | null;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  roleIds?: string[];
}
