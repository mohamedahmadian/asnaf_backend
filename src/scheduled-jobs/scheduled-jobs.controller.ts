import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PaginationQueryDto } from '../common/pagination';
import { ScheduledJobsService } from './scheduled-jobs.service';

type RequestUser = { id: string };

@Controller('scheduled-jobs')
export class ScheduledJobsController {
  constructor(private readonly jobs: ScheduledJobsService) {}

  @Get()
  list() {
    return this.jobs.list();
  }

  @Get(':code/runs')
  listRuns(@Param('code') code: string, @Query() query: PaginationQueryDto) {
    return this.jobs.listRuns(code, query);
  }

  @Post(':code/run')
  run(@Param('code') code: string, @CurrentUser() user: RequestUser | undefined) {
    return this.jobs.runManual(code, user?.id);
  }

  @Get(':code')
  findOne(@Param('code') code: string) {
    return this.jobs.findOne(code);
  }
}
