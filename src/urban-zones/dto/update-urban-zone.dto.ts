import { PartialType } from '@nestjs/mapped-types';
import { CreateUrbanZoneDto } from './create-urban-zone.dto';

export class UpdateUrbanZoneDto extends PartialType(CreateUrbanZoneDto) {}
