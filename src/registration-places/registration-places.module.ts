import { Module } from '@nestjs/common';
import { RegistrationPlacesController } from './registration-places.controller';
import { RegistrationPlacesService } from './registration-places.service';

@Module({
  controllers: [RegistrationPlacesController],
  providers: [RegistrationPlacesService],
  exports: [RegistrationPlacesService],
})
export class RegistrationPlacesModule {}
