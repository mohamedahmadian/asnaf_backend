import { Module } from '@nestjs/common';
import { CaseLetterheadService } from '../cases/case-letterhead.service';
import { InquiryCentersController } from './inquiry-centers.controller';
import { InquiryCentersService } from './inquiry-centers.service';

@Module({
  controllers: [InquiryCentersController],
  providers: [InquiryCentersService, CaseLetterheadService],
  exports: [InquiryCentersService],
})
export class InquiryCentersModule {}
