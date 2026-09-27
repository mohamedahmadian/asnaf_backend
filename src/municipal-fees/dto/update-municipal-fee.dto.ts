import { PartialType } from '@nestjs/mapped-types';
import { CreateMunicipalFeeDto } from './create-municipal-fee.dto';

export class UpdateMunicipalFeeDto extends PartialType(CreateMunicipalFeeDto) {}
