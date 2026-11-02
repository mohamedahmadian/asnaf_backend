import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { emptyToUndefined } from '../../common/dto-transform';
import { PaginationQueryDto } from '../../common/pagination';
import { sortDirections } from '../../common/sort-query';
import { DocumentGender } from '../../generated/prisma/client';

function emptyToNull({ value }: { value: unknown }) {
  if (value == null) return null;
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export class SaveRentalLicenseSettingsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  contractYears?: number;

  @Transform(emptyToNull)
  @ValidateIf((_, value) => value != null)
  @IsString()
  @MaxLength(120)
  signerName?: string | null;

  @Transform(emptyToNull)
  @ValidateIf((_, value) => value != null)
  @IsString()
  @MaxLength(120)
  signerTitle?: string | null;

  @IsOptional()
  @Transform(({ value }) => (value === '' || value == null ? null : value))
  @ValidateIf((_, value) => value != null)
  @IsUUID('4')
  signatureId?: string | null;
}

export class CreateRentalIdentityDocumentDto {
  @IsString()
  @Matches(/^[A-Za-z0-9-]{1,64}$/)
  documentId: string;

  @IsIn(['MALE', 'FEMALE', 'BOTH'])
  gender: DocumentGender;

  @IsBoolean()
  isRequired: boolean;
}

export const rentalIdentityDocumentSortFields = ['title', 'isRequired', 'gender'] as const;

export class FindRentalIdentityDocumentsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...rentalIdentityDocumentSortFields])
  sortBy?: (typeof rentalIdentityDocumentSortFields)[number];

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...sortDirections])
  sortDir?: (typeof sortDirections)[number];
}

export class RequirementDocumentDto {
  @IsString()
  @Matches(/^[A-Za-z0-9-]{1,64}$/)
  documentId: string;

  @IsIn(['MALE', 'FEMALE', 'BOTH'])
  gender: DocumentGender;

  @IsBoolean()
  isRequired: boolean;
}

export class SaveRentalDocumentsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RequirementDocumentDto)
  documents: RequirementDocumentDto[];
}

export class CreateRentalProcessRoleDto {
  @IsUUID()
  roleId: string;

  @IsString()
  @MaxLength(120)
  title: string;
}
