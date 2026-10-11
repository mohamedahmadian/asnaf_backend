import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsIn, IsString, IsUUID, Matches, ValidateNested } from 'class-validator';
import { DocumentGender } from '../../generated/prisma/client';

export class RequirementDocumentDto {
  @IsString()
  @Matches(/^[A-Za-z0-9-]{1,64}$/)
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
  @IsIn(['ISSUANCE', 'RENEWAL', 'LOCATION_CHANGE', 'AUCTION'])
  requestType: 'ISSUANCE' | 'RENEWAL' | 'LOCATION_CHANGE' | 'AUCTION';

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RequirementDocumentDto)
  documents: RequirementDocumentDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RequirementInquiryDto)
  inquiries: RequirementInquiryDto[];
}
