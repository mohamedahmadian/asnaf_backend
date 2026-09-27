import { Module } from '@nestjs/common';
import { JobGroupsController } from './job-groups.controller';
import { JobGroupsService } from './job-groups.service';
import { JobsCatalogController } from './jobs-catalog.controller';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';

@Module({
  controllers: [JobGroupsController, JobsController, JobsCatalogController],
  providers: [JobGroupsService, JobsService],
})
export class JobGroupsModule {}
