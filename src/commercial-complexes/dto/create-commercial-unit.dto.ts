import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateCommercialUnitDto {
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  plaque: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string | null;

  @IsString()
  @MinLength(1)
  @MaxLength(32)
  code: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
