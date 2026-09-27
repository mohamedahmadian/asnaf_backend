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
import { CreateJobGroupRepresentativeDto } from './dto/create-job-group-representative.dto';
import { FindJobGroupRepresentativesQueryDto } from './dto/find-job-group-representatives-query.dto';
import { FindJobGroupsQueryDto } from './dto/find-job-groups-query.dto';
import { UpdateJobGroupDto } from './dto/update-job-group.dto';
import { JobGroupRepresentativesService } from './job-group-representatives.service';
import { JobGroupsService } from './job-groups.service';

@Controller('job-groups')
export class JobGroupsController {
  constructor(
    private readonly groups: JobGroupsService,
    private readonly representatives: JobGroupRepresentativesService,
  ) {}

  @Get()
  findAll(@Query() query: FindJobGroupsQueryDto) {
    return this.groups.findAll(query);
  }

  @Post()
  create(@Body() dto: CreateJobGroupDto) {
    return this.groups.create(dto);
  }

  @Get(':id/representatives')
  findRepresentatives(
    @Param('id') id: string,
    @Query() query: FindJobGroupRepresentativesQueryDto,
  ) {
    return this.representatives.findAll(id, query);
  }

  @Post(':id/representatives')
  createRepresentative(
    @Param('id') id: string,
    @Body() dto: CreateJobGroupRepresentativeDto,
  ) {
    return this.representatives.create(id, dto);
  }

  @Delete(':id/representatives/:userId')
  removeRepresentative(@Param('id') id: string, @Param('userId') userId: string) {
    return this.representatives.remove(id, userId);
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
