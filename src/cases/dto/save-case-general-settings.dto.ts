import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsUUID, ValidateIf } from 'class-validator';

export class SaveCaseGeneralSettingsDto {
  @IsBoolean()
  editAfterIssuance: boolean;

  @IsOptional()
  @Transform(({ value }) => (value === '' || value == null ? null : value))
  @ValidateIf((_, value) => value != null)
  @IsUUID('4')
  editorRoleId?: string | null;
}
