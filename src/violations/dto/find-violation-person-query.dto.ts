import { Transform } from 'class-transformer';
import { IsString } from 'class-validator';
import { IsIranianNationalId, normalizeNationalId } from '../../common/national-id';

export class FindViolationPersonQueryDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? normalizeNationalId(value) : value,
  )
  @IsString()
  @IsIranianNationalId()
  nationalId: string;
}
