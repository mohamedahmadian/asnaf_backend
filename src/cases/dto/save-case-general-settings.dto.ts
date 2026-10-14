import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsUUID, Max, Min, ValidateIf } from 'class-validator';
import { CONTRACT_DURATION_MAX, CONTRACT_DURATION_MIN } from '../contract-duration';

export class SaveCaseGeneralSettingsDto {
  @IsBoolean()
  editAfterIssuance: boolean;

  @IsOptional()
  @Transform(({ value }) => (value === '' || value == null ? null : value))
  @ValidateIf((_, value) => value != null)
  @IsUUID('4')
  editorRoleId?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(CONTRACT_DURATION_MIN)
  @Max(CONTRACT_DURATION_MAX)
  contractYears?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(CONTRACT_DURATION_MIN)
  @Max(CONTRACT_DURATION_MAX)
  stewardContractYears?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(90)
  inquiryResponseDays?: number;
}
