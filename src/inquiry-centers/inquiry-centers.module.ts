import { Module } from '@nestjs/common';
import { InquiryCentersController } from './inquiry-centers.controller';
import { InquiryCentersService } from './inquiry-centers.service';

@Module({
  controllers: [InquiryCentersController],
  providers: [InquiryCentersService],
  exports: [InquiryCentersService],
})
export class InquiryCentersModule {}
