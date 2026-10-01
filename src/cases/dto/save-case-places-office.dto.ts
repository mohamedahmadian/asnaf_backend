import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsUUID, MaxLength, ValidateIf } from 'class-validator';
import { emptyToUndefined } from '../../common/dto-transform';

export class SaveCasePlacesOfficeDto {
  @IsOptional()
  @Transform(({ value }) => (value === '' || value == null ? null : value))
  @ValidateIf((_, value) => value != null)
  @IsUUID('4')
  officerId?: string | null;

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
}
