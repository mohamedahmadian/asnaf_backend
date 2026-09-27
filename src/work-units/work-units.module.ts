import { Module } from '@nestjs/common';
import { WorkUnitsController } from './work-units.controller';
import { WorkUnitsService } from './work-units.service';

@Module({
  controllers: [WorkUnitsController],
  providers: [WorkUnitsService],
  exports: [WorkUnitsService],
})
export class WorkUnitsModule {}
