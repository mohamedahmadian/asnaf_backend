import { IsIn, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateCaseProcessManagementRoleDto {
  @IsIn(['ISSUANCE', 'RENEWAL', 'LOCATION_CHANGE', 'AUCTION'])
  requestType: 'ISSUANCE' | 'RENEWAL' | 'LOCATION_CHANGE' | 'AUCTION';

  @IsUUID()
  roleId: string;

  @IsString()
  @MaxLength(120)
  title: string;
}
