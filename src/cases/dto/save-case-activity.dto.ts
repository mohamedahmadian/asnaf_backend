import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { IsIranianIban, normalizeIban } from '../../common/bank-account';
import { emptyToNull } from '../../common/dto-transform';

export class CaseAssetAccountDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  bankName: string;

  @Transform(({ value }) =>
    typeof value === 'string' ? normalizeIban(value) : value,
  )
  @IsString()
  @IsIranianIban()
  iban: string;
}

export const previousOccupations = [
  'OTHER',
  'ACTIVE_MILITARY',
  'RETIRED_MILITARY',
  'ACTIVE_EMPLOYEE',
  'RETIRED_EMPLOYEE',
] as const;

export class SaveCaseActivityDto {
  @IsUUID('4')
  caseId: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  businessUnitTitle: string;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(value))
  @ValidateIf((_, value) => value != null)
  @IsUUID('4')
  jobGroupId?: string | null;

  @IsUUID('4')
  jobId: string;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(value))
  @ValidateIf((_, value) => value != null)
  @IsIn(previousOccupations)
  previousOccupation?: (typeof previousOccupations)[number] | null;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === '' || value == null) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : value;
  })
  @ValidateIf((_, value) => value != null)
  @IsInt()
  @Min(0)
  @Max(999)
  posDeviceCount?: number | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CaseAssetAccountDto)
  assetAccounts?: CaseAssetAccountDto[];
}
