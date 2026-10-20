import { Module } from '@nestjs/common';
import { CasesModule } from '../cases/cases.module';
import { ScheduledJobsController } from './scheduled-jobs.controller';
import { ScheduledJobsService } from './scheduled-jobs.service';

@Module({
  imports: [CasesModule],
  controllers: [ScheduledJobsController],
  providers: [ScheduledJobsService],
  exports: [ScheduledJobsService],
})
export class ScheduledJobsModule {}
