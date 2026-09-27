import { Module } from '@nestjs/common';
import { CommercialComplexesController } from './commercial-complexes.controller';
import { CommercialComplexesService } from './commercial-complexes.service';
import { CommercialFloorsController } from './commercial-floors.controller';
import { CommercialFloorsService } from './commercial-floors.service';
import { CommercialLanesController } from './commercial-lanes.controller';
import { CommercialLanesService } from './commercial-lanes.service';
import { CommercialUnitsController } from './commercial-units.controller';
import { CommercialUnitsService } from './commercial-units.service';

@Module({
  controllers: [
    CommercialComplexesController,
    CommercialFloorsController,
    CommercialLanesController,
    CommercialUnitsController,
  ],
  providers: [
    CommercialComplexesService,
    CommercialFloorsService,
    CommercialLanesService,
    CommercialUnitsService,
  ],
})
export class CommercialComplexesModule {}
