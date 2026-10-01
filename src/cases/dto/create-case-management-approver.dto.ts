import { IsUUID } from 'class-validator';

export class CreateCaseManagementApproverDto {
  @IsUUID()
  workUnitId: string;

  @IsUUID()
  roleId: string;
}
