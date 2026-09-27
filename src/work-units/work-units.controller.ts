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
import { CreateWorkUnitDto } from './dto/create-work-unit.dto';
import { FindWorkUnitsQueryDto } from './dto/find-work-units-query.dto';
import { UpdateWorkUnitDto } from './dto/update-work-unit.dto';
import { WorkUnitsService } from './work-units.service';

@Controller('work-units')
export class WorkUnitsController {
  constructor(private readonly workUnits: WorkUnitsService) {}

  @Get()
  findAll(@Query() query: FindWorkUnitsQueryDto) {
    return this.workUnits.findAll(query);
  }

  @Post()
  create(@Body() dto: CreateWorkUnitDto) {
    return this.workUnits.create(dto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.workUnits.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateWorkUnitDto) {
    return this.workUnits.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.workUnits.remove(id);
  }
}
