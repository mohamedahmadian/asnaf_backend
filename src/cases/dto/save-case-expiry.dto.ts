import { Matches } from 'class-validator';

export class SaveCaseExpiryDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  expiresAt: string;
}
