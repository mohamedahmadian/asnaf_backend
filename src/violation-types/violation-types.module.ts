import { Module } from '@nestjs/common';
import { ViolationTypesController } from './violation-types.controller';
import { ViolationTypesService } from './violation-types.service';

@Module({
  controllers: [ViolationTypesController],
  providers: [ViolationTypesService],
  exports: [ViolationTypesService],
})
export class ViolationTypesModule {}
