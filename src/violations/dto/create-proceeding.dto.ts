import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { emptyToNull } from '../../common/dto-transform';

function trimString(value: unknown) {
  return typeof value === 'string' ? value.trim() : value;
}

export class CreateProceedingDto {
  @IsString()
  @MinLength(10)
  @MaxLength(10)
  occurredAt: string;

  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title: string;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(trimString(value)))
  @IsString()
  @MaxLength(4000)
  description?: string | null;
}
