import { IsInt, IsUUID, Max, Min } from 'class-validator';

export class SaveFormationStepDto {
  @IsUUID('4')
  caseId: string;

  @IsInt()
  @Min(0)
  @Max(6)
  step: number;
}
