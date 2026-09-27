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
import { CommercialComplexesService } from './commercial-complexes.service';
import { CreateCommercialComplexDto } from './dto/create-commercial-complex.dto';
import { FindCommercialComplexesQueryDto } from './dto/find-commercial-complexes-query.dto';
import { UpdateCommercialComplexDto } from './dto/update-commercial-complex.dto';

@Controller('commercial-complexes')
export class CommercialComplexesController {
  constructor(private readonly complexes: CommercialComplexesService) {}

  @Get()
  findAll(@Query() query: FindCommercialComplexesQueryDto) {
    return this.complexes.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.complexes.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateCommercialComplexDto) {
    return this.complexes.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCommercialComplexDto) {
    return this.complexes.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.complexes.remove(id);
  }
}
