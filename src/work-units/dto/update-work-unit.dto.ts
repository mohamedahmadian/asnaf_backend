import { PartialType } from '@nestjs/mapped-types';
import { CreateWorkUnitDto } from './create-work-unit.dto';

export class UpdateWorkUnitDto extends PartialType(CreateWorkUnitDto) {}
