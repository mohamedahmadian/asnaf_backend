import { Transform } from 'class-transformer';
import { IsOptional, IsString } from 'class-validator';
import { normalizeNationalId } from '../../common/national-id';
import { normalizeMobile } from '../../common/phone';

export class CheckRegisterDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? normalizeMobile(value) : value))
  @IsString()
  phone?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  lastName?: string;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? normalizeNationalId(value) : value,
  )
  @IsString()
  nationalId?: string;
}
