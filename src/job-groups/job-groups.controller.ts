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
import { CreateJobGroupDto } from './dto/create-job-group.dto';
import { FindJobGroupsQueryDto } from './dto/find-job-groups-query.dto';
import { UpdateJobGroupDto } from './dto/update-job-group.dto';
import { JobGroupsService } from './job-groups.service';

@Controller('job-groups')
export class JobGroupsController {
  constructor(private readonly groups: JobGroupsService) {}

  @Get()
  findAll(@Query() query: FindJobGroupsQueryDto) {
    return this.groups.findAll(query);
  }

  @Post()
  create(@Body() dto: CreateJobGroupDto) {
    return this.groups.create(dto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.groups.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateJobGroupDto) {
    return this.groups.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.groups.remove(id);
  }
}
