import { Module } from '@nestjs/common';
import { PersonFileStorage } from '../cases/person-file.storage';
import { RentalLicensesController } from './rental-licenses.controller';
import { RentalLicensesService } from './rental-licenses.service';
import { RentalSettingsController } from './rental-settings.controller';
import { RentalSettingsService } from './rental-settings.service';

@Module({
  controllers: [RentalSettingsController, RentalLicensesController],
  providers: [RentalSettingsService, RentalLicensesService, PersonFileStorage],
})
export class RequestsModule {}
