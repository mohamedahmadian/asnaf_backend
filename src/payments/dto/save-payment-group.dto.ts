import { Transform } from 'class-transformer';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

const databaseUuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function trimString(value: unknown) {
  return typeof value === 'string' ? value.trim() : value;
}

export class SavePaymentGroupDto {
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  title: string;

  @Transform(({ value }) => trimString(value))
  @Matches(databaseUuidPattern)
  bankAccountId: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @Matches(databaseUuidPattern, { each: true })
  feeIds: string[];
}
