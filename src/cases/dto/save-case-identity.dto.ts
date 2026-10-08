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
  @IsString()
  @MinLength(1)
  firstName: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  lastName: string;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(value))
  @ValidateIf((_, value) => value != null)
  @IsString()
  fatherName?: string | null;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(value))
  @ValidateIf((_, value) => value != null)
  @IsString()
  lastNameEn?: string | null;

  @IsOptional()
  @Transform(({ value }) => dateOrNull(value))
  @ValidateIf((_, value) => value != null)
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  birthDate?: string | null;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(value))
  @ValidateIf((_, value) => value != null)
  @IsEnum(ResidencyStatus)
  residencyStatus?: ResidencyStatus | null;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(value))
  @ValidateIf((_, value) => value != null)
  @IsString()
  passportNumber?: string | null;

  @IsOptional()
  @Transform(({ value }) => dateOrNull(value))
  @ValidateIf((_, value) => value != null)
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  nationalCardExpiresAt?: string | null;

  @IsOptional()
  @Transform(({ value }) => dateOrNull(value))
  @ValidateIf((_, value) => value != null)
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  passportExpiresAt?: string | null;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(value))
  @ValidateIf((_, value) => value != null)
  @IsString()
  identityCertificateNo?: string | null;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(value))
  @ValidateIf((_, value) => value != null)
  @IsString()
  birthPlace?: string | null;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(value))
  @ValidateIf((_, value) => value != null)
  @IsString()
  identityIssuedIn?: string | null;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(value))
  @ValidateIf((_, value) => value != null)
  @IsUUID('4')
  countryId?: string | null;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? normalizePhone(value) || null : emptyToNull(value),
  )
  @ValidateIf((_, value) => value != null)
  @IsString()
  phone?: string | null;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? normalizePhone(value) || null : emptyToNull(value),
  )
  @ValidateIf((_, value) => value != null)
  @IsString()
  homePhone?: string | null;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(value))
  @ValidateIf((_, value) => value != null)
  @IsString()
  postalCode?: string | null;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(value))
  @ValidateIf((_, value) => value != null)
  @IsString()
  address?: string | null;

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
  @IsEnum(EducationLevel)
  educationLevel?: EducationLevel | null;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(value))
  @ValidateIf((_, value) => value != null)
  @IsString()
  citizenGroup?: string | null;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(value))
  @ValidateIf((_, value) => value != null)
  @IsUUID('4')
  jobId?: string | null;

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
  @IsEnum(UserGender)
  gender?: UserGender | null;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(value))
  @ValidateIf((_, value) => value != null)
  @IsUUID('4')
  caseId?: string | null;

  @IsOptional()
  @IsBoolean()
  startNew?: boolean;
}
