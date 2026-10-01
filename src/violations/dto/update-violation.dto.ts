import { Transform } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { emptyToNull } from '../../common/dto-transform';
import { IsIranianNationalId, normalizeNationalId } from '../../common/national-id';
import { violationStatuses } from '../violation-status';

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

export class UpdateViolationDto {
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? normalizeNationalId(value) : value,
  )
  @IsIranianNationalId()
  nationalId?: string;

  @IsOptional()
  @IsUUID()
  violationTypeId?: string;

  @IsOptional()
  @IsString()
  @MinLength(10)
  @MaxLength(10)
  occurredAt?: string;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(trimString(value)))
  @IsString()
  @MaxLength(4000)
  description?: string | null;

  @IsOptional()
  @IsIn([...violationStatuses])
  status?: (typeof violationStatuses)[number];

  @IsOptional()
  @Transform(({ value }) => (value === '' || value == null ? null : value))
  @ValidateIf((_, value) => value != null)
  @IsUUID()
  caseUserId?: string | null;

  @IsOptional()
  @Transform(({ value }) => toIdList(value))
  @IsArray()
  @IsUUID('4', { each: true })
  removeAttachmentIds?: string[];
}
