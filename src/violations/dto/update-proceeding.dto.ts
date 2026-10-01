import { Transform } from 'class-transformer';
import {
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { emptyToNull } from '../../common/dto-transform';

function trimString(value: unknown) {
  return typeof value === 'string' ? value.trim() : value;
}

function toIdList(value: unknown) {
  if (value == null || value === '') return undefined;
  const list = Array.isArray(value) ? value : [value];
  const ids = list
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
  return ids.length ? ids : undefined;
}

export class UpdateProceedingDto {
  @IsOptional()
  @IsString()
  @MinLength(10)
  @MaxLength(10)
  occurredAt?: string;

  @IsOptional()
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(trimString(value)))
  @IsString()
  @MaxLength(4000)
  description?: string | null;

  @IsOptional()
  @Transform(({ value }) => toIdList(value))
  @IsArray()
  @IsUUID('4', { each: true })
  removeAttachmentIds?: string[];
}
