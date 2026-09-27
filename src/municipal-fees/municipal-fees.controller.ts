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
import { CreateMunicipalFeeDto } from './dto/create-municipal-fee.dto';
import { FindMunicipalFeesQueryDto } from './dto/find-municipal-fees-query.dto';
import { UpdateMunicipalFeeDto } from './dto/update-municipal-fee.dto';
import { MunicipalFeesService } from './municipal-fees.service';

@Controller('municipal-fees')
export class MunicipalFeesController {
  constructor(private readonly municipalFees: MunicipalFeesService) {}

  @Get()
  findAll(@Query() query: FindMunicipalFeesQueryDto) {
    return this.municipalFees.findAll(query);
  }

  @Post()
  create(@Body() dto: CreateMunicipalFeeDto) {
    return this.municipalFees.create(dto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.municipalFees.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateMunicipalFeeDto) {
    return this.municipalFees.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.municipalFees.remove(id);
  }
}
