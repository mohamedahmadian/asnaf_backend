import { PartialType } from '@nestjs/mapped-types';
import { CreateRegistrationPlaceDto } from './create-registration-place.dto';

export class UpdateRegistrationPlaceDto extends PartialType(
  CreateRegistrationPlaceDto,
) {}
