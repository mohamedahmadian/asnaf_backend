import { IsEnum, IsString, Matches } from 'class-validator';
import { DocumentGender } from '../../generated/prisma/client';

export class CreateCaseIdentityDocumentDto {
  @IsString()
  @Matches(/^[A-Za-z0-9-]{1,64}$/)
  documentId: string;

  @IsEnum(DocumentGender)
  gender: DocumentGender;
}
