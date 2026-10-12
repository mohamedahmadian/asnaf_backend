import { IsIn, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateCaseProcessManagementRoleDto {
  @IsIn(['ISSUANCE', 'RENEWAL', 'LOCATION_CHANGE', 'AUCTION', 'STEWARDSHIP'])
  requestType: 'ISSUANCE' | 'RENEWAL' | 'LOCATION_CHANGE' | 'AUCTION' | 'STEWARDSHIP';

  @IsUUID()
  roleId: string;

  @IsString()
  @MaxLength(120)
  title: string;
}
