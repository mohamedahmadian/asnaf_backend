import { PartialType } from '@nestjs/mapped-types';
import { CreateCommercialUnitDto } from './create-commercial-unit.dto';

export class UpdateCommercialUnitDto extends PartialType(
  CreateCommercialUnitDto,
) {}
