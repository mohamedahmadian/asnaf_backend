import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, Matches } from 'class-validator';
import { emptyToUndefined, toOptionalBoolean } from '../../common/dto-transform';
import { PaginationQueryDto } from '../../common/pagination';
import { sortDirections } from '../../common/sort-query';

const databaseUuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const municipalFeeSortFields = [
  'title',
  'amount',
  'calcKind',
  'bankAccount',
  'description',
  'isActive',
] as const;

export class FindMunicipalFeesQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @Matches(databaseUuidPattern)
  bankAccountId?: string;

  @IsOptional()
  @Transform(({ value }) => toOptionalBoolean(value))
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...municipalFeeSortFields])
  sortBy?: (typeof municipalFeeSortFields)[number];

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...sortDirections])
  sortDir?: (typeof sortDirections)[number];
}
