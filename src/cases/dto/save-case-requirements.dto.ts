import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsIn, IsUUID, ValidateNested } from 'class-validator';
import { DocumentGender } from '../../generated/prisma/client';

export class RequirementDocumentDto {
  @IsUUID('4')
  documentId: string;

  @IsIn(['MALE', 'FEMALE', 'BOTH'])
  gender: DocumentGender;

  @IsBoolean()
  isRequired: boolean;
}

export class RequirementInquiryDto {
  @IsUUID('4')
  inquiryCenterId: string;
}

export class SaveCaseRequirementsDto {
  @IsIn(['ISSUANCE', 'RENEWAL', 'LOCATION_CHANGE'])
  requestType: 'ISSUANCE' | 'RENEWAL' | 'LOCATION_CHANGE';

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RequirementDocumentDto)
  documents: RequirementDocumentDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RequirementInquiryDto)
  inquiries: RequirementInquiryDto[];
}
