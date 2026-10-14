import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { emptyToUndefined } from '../../common/dto-transform';

export class SaveCasePlacesOfficeDto {
  @IsOptional()
  @Transform(({ value }) => (value === '' || value == null ? null : value))
  @ValidateIf((_, value) => value != null)
  @IsUUID('4')
  officerRoleId?: string | null;

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsString()
  @MaxLength(20)
  phone?: string | null;

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsString()
  @MaxLength(200)
  letterTitle?: string | null;

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsString()
  @MaxLength(8000)
  letterBody?: string | null;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(90)
  responseDays: number;
}
