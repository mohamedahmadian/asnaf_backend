import { IsUUID } from 'class-validator';

export class CreateCaseIdentityDocumentDto {
  @IsUUID()
  documentId: string;
}
