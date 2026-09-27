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
import { ApplyJobsAnnualFeeDto } from './dto/apply-jobs-annual-fee.dto';
import { CreateJobTypeDto } from './dto/create-job-type.dto';
import { FindJobTypesQueryDto } from './dto/find-job-types-query.dto';
import { UpdateJobTypeDto } from './dto/update-job-type.dto';
import { JobTypesService } from './job-types.service';

@Controller('job-types')
export class JobTypesController {
  constructor(private readonly jobTypes: JobTypesService) {}

  @Get()
  findAll(@Query() query: FindJobTypesQueryDto) {
    return this.jobTypes.findAll(query);
  }

  @Post()
  create(@Body() dto: CreateJobTypeDto) {
    return this.jobTypes.create(dto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.jobTypes.findOne(id);
  }

  @Patch(':id/jobs-annual-fee')
  applyJobsAnnualFee(@Param('id') id: string, @Body() dto: ApplyJobsAnnualFeeDto) {
    return this.jobTypes.applyJobsAnnualFee(id, dto.annualFee);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateJobTypeDto) {
    return this.jobTypes.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.jobTypes.remove(id);
  }
}
