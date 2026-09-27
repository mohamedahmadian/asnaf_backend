import { PartialType } from '@nestjs/mapped-types';
import { CreateCommercialComplexDto } from './create-commercial-complex.dto';

export class UpdateCommercialComplexDto extends PartialType(
  CreateCommercialComplexDto,
) {}
