import { IsString, Matches, MaxLength } from 'class-validator';

export class UpdateCaseLetterIssueDto {
  @IsString()
  @MaxLength(40)
  letterNo: string;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  issuedAt: string;
}
