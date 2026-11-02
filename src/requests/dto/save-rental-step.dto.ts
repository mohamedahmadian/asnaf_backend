import { IsInt, IsOptional, IsUUID, Matches, Max, Min, ValidateIf } from 'class-validator';

export class SaveRentalStepDto {
  @IsUUID('4')
  licenseId: string;

  @IsInt()
  @Min(0)
  @Max(3)
  step: number;

  @IsOptional()
  @ValidateIf((_, value) => value != null && value !== '')
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  licenseIssuedAt?: string;

  @IsOptional()
  @ValidateIf((_, value) => value != null && value !== '')
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  licenseExpiresAt?: string;
}

