import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsIn, IsOptional } from 'class-validator';
import { emptyToUndefined, toOptionalBoolean } from '../../common/dto-transform';
import { PaginationQueryDto } from '../../common/pagination';
import { sortDirections } from '../../common/sort-query';
import { DocumentGender } from '../../generated/prisma/client';

export const documentSortFields = [
  'title',
  'isRequired',
  'gender',
  'isFixed',
] as const;

export class FindDocumentsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Transform(({ value }) => toOptionalBoolean(value))
  @IsBoolean()
  isRequired?: boolean;

  @IsOptional()
  @Transform(({ value }) => toOptionalBoolean(value))
  @IsBoolean()
  isFixed?: boolean;

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsEnum(DocumentGender)
  gender?: DocumentGender;

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...documentSortFields])
  sortBy?: (typeof documentSortFields)[number];

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...sortDirections])
  sortDir?: (typeof sortDirections)[number];
}
