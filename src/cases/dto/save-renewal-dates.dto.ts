import { IsUUID, Matches } from 'class-validator';

export class SaveRenewalDatesDto {
  @IsUUID('4')
  caseId: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  nextIssuedAt: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  nextExpiresAt: string;
}
