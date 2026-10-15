import { PartialType } from '@nestjs/mapped-types';
import { CreateFinancialHeadingDto } from './create-financial-heading.dto';

export class UpdateFinancialHeadingDto extends PartialType(
  CreateFinancialHeadingDto,
) {}
