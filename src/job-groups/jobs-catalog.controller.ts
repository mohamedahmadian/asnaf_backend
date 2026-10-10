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
import { CreateJobCatalogDto } from './dto/create-job-catalog.dto';
import { FindJobsCatalogQueryDto } from './dto/find-jobs-catalog-query.dto';
import { UpdateJobCatalogDto } from './dto/update-job-catalog.dto';
import { JobsService } from './jobs.service';

@Controller('jobs')
export class JobsCatalogController {
  constructor(private readonly jobs: JobsService) {}

  @Get()
  findAll(@Query() query: FindJobsCatalogQueryDto) {
    return this.jobs.findCatalog(query);
  }

  @Get('stats')
  stats() {
    return this.jobs.catalogStats();
  }

  @Post()
  create(@Body() dto: CreateJobCatalogDto) {
    return this.jobs.createCatalog(dto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.jobs.findCatalogOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateJobCatalogDto) {
    return this.jobs.updateCatalog(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.jobs.removeCatalog(id);
  }
}
