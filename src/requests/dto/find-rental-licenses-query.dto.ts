import { Transform } from 'class-transformer';
import { IsIn, IsOptional } from 'class-validator';
import { emptyToUndefined } from '../../common/dto-transform';
import { PaginationQueryDto } from '../../common/pagination';
import { sortDirections } from '../../common/sort-query';

export const rentalLicenseSortFields = [
  'fullName',
  'nationalId',
  'licenseNumber',
  'status',
  'createdAt',
  'licenseExpiresAt',
] as const;

export const rentalLicenseStatuses = ['DRAFT', 'ACTIVE', 'EXPIRED'] as const;

export class FindRentalLicensesQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...rentalLicenseSortFields])
  sortBy?: (typeof rentalLicenseSortFields)[number];

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...sortDirections])
  sortDir?: (typeof sortDirections)[number];

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...rentalLicenseStatuses])
  status?: (typeof rentalLicenseStatuses)[number];
}
