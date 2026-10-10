import { IsIn } from 'class-validator';

export class OpenCaseRequestDto {
  @IsIn(['RENEWAL', 'LOCATION_CHANGE'])
  type: 'RENEWAL' | 'LOCATION_CHANGE';
}
