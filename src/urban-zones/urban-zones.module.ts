import { Module } from '@nestjs/common';
import { UrbanZonesController } from './urban-zones.controller';
import { UrbanZonesService } from './urban-zones.service';

@Module({
  controllers: [UrbanZonesController],
  providers: [UrbanZonesService],
  exports: [UrbanZonesService],
})
export class UrbanZonesModule {}
