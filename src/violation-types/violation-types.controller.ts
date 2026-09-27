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
import { CreateViolationTypeDto } from './dto/create-violation-type.dto';
import { FindViolationTypesQueryDto } from './dto/find-violation-types-query.dto';
import { UpdateViolationTypeDto } from './dto/update-violation-type.dto';
import { ViolationTypesService } from './violation-types.service';

@Controller('violation-types')
export class ViolationTypesController {
  constructor(private readonly violationTypes: ViolationTypesService) {}

  @Get()
  findAll(@Query() query: FindViolationTypesQueryDto) {
    return this.violationTypes.findAll(query);
  }

  @Post()
  create(@Body() dto: CreateViolationTypeDto) {
    return this.violationTypes.create(dto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.violationTypes.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateViolationTypeDto) {
    return this.violationTypes.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.violationTypes.remove(id);
  }
}
