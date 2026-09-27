import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateCommercialFloorDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string | null;

  @IsString()
  @MinLength(1)
  @MaxLength(32)
  code: string;
}
