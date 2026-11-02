import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateCommercialUnitSeriesDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(999999)
  from: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(999999)
  to: number;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  prefix?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string | null;
}
