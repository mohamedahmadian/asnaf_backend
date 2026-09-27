import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { DocumentGender } from '../../generated/prisma/client';

function trimString(value: unknown) {
  return typeof value === 'string' ? value.trim() : value;
}

export class CreateDocumentDto {
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  title: string;

  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  @IsEnum(DocumentGender)
  gender: DocumentGender;

  @IsOptional()
  @IsBoolean()
  isFixed?: boolean;
}
