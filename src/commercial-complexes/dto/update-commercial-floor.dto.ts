import { PartialType } from '@nestjs/mapped-types';
import { CreateCommercialFloorDto } from './create-commercial-floor.dto';

export class UpdateCommercialFloorDto extends PartialType(
  CreateCommercialFloorDto,
) {}
