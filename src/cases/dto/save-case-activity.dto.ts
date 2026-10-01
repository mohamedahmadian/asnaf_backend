import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, Min, MinLength, ValidateIf } from 'class-validator';
import { emptyToNull } from '../../common/dto-transform';

export const previousOccupations = [
  'OTHER',
  'ACTIVE_MILITARY',
  'RETIRED_MILITARY',
  'ACTIVE_EMPLOYEE',
  'RETIRED_EMPLOYEE',
] as const;

export class SaveCaseActivityDto {
  @IsUUID('4')
  userId: string;

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
}
