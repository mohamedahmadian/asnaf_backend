import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CreateJobDto } from './dto/create-job.dto';
import { FindJobsQueryDto } from './dto/find-jobs-query.dto';
import { UpdateJobDto } from './dto/update-job.dto';
import { JobsService } from './jobs.service';

@Controller('job-groups/:groupId/jobs')
export class JobsController {
  constructor(private readonly jobs: JobsService) {}

  @Get()
  findAll(
    @Param('groupId') groupId: string,
    @Query() query: FindJobsQueryDto,
  ) {
    return this.jobs.findAll(groupId, query);
  }

  @Post()
  create(@Param('groupId') groupId: string, @Body() dto: CreateJobDto) {
    return this.jobs.create(groupId, dto);
  }

  @Get(':id')
  findOne(@Param('groupId') groupId: string, @Param('id') id: string) {
    return this.jobs.findOne(groupId, id);
  }

  @Patch(':id')
  update(
    @Param('groupId') groupId: string,
    @Param('id') id: string,
    @Body() dto: UpdateJobDto,
  ) {
    return this.jobs.update(groupId, id, dto);
  }

  @Delete(':id')
  remove(@Param('groupId') groupId: string, @Param('id') id: string) {
    return this.jobs.remove(groupId, id);
  }
}
