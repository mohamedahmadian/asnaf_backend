import { Transform, Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { emptyToUndefined } from '../../common/dto-transform';
import { PaginationQueryDto } from '../../common/pagination';
import { sortDirections } from '../../common/sort-query';
import {
  EducationLevel,
  ResidencyStatus,
  UserGender,
} from '../../generated/prisma/client';

export const caseSortFields = [
  'fullName',
  'fatherName',
  'nationalId',
  'phone',
  'gender',
  'residencyStatus',
  'educationLevel',
  'job',
  'formationStep',
] as const;

export type CaseSortField = (typeof caseSortFields)[number];

export class FindCasesQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsEnum(UserGender)
  gender?: UserGender;

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsEnum(ResidencyStatus)
  residencyStatus?: ResidencyStatus;

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsEnum(EducationLevel)
  educationLevel?: EducationLevel;

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsUUID()
  jobId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(6)
  step?: number;

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...caseSortFields])
  sortBy?: CaseSortField;

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...sortDirections])
  sortDir?: (typeof sortDirections)[number];
}
