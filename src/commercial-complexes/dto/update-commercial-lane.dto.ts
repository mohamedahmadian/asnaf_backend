import { PartialType } from '@nestjs/mapped-types';
import { CreateCommercialLaneDto } from './create-commercial-lane.dto';

export class UpdateCommercialLaneDto extends PartialType(
  CreateCommercialLaneDto,
) {}
