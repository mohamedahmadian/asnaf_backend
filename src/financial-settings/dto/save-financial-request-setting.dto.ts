import { ArrayUnique, IsArray, IsString, Matches } from 'class-validator';

const databaseUuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class SaveFinancialRequestSettingDto {
  @IsString()
  @Matches(databaseUuidPattern)
  bankAccountId: string;

  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @Matches(databaseUuidPattern, { each: true })
  feeIds: string[];
}
