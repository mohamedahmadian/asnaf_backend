import { Module } from '@nestjs/common';
import { JobTypesController } from './job-types.controller';
import { JobTypesService } from './job-types.service';

@Module({
  controllers: [JobTypesController],
  providers: [JobTypesService],
  exports: [JobTypesService],
})
export class JobTypesModule {}
