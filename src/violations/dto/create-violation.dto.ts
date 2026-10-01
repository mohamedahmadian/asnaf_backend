import { Transform } from 'class-transformer';
import {
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

export class CreateViolationDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? normalizeNationalId(value) : value,
  )
  @IsIranianNationalId()
  nationalId: string;

  @IsUUID()
  violationTypeId: string;

  @IsString()
  @MinLength(10)
  @MaxLength(10)
  occurredAt: string;

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
}
