import { PartialType } from '@nestjs/mapped-types';
import { CreateInquiryCenterDto } from './create-inquiry-center.dto';

export class UpdateInquiryCenterDto extends PartialType(CreateInquiryCenterDto) {}
