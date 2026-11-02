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
import { CreateUrbanZoneDto } from './dto/create-urban-zone.dto';
import { FindUrbanZonesQueryDto } from './dto/find-urban-zones-query.dto';
import { UpdateUrbanZoneDto } from './dto/update-urban-zone.dto';
import { UrbanZonesService } from './urban-zones.service';

@Controller('urban-zones')
export class UrbanZonesController {
  constructor(private readonly urbanZones: UrbanZonesService) {}

  @Get()
  findAll(@Query() query: FindUrbanZonesQueryDto) {
    return this.urbanZones.findAll(query);
  }

  @Post()
  create(@Body() dto: CreateUrbanZoneDto) {
    return this.urbanZones.create(dto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.urbanZones.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateUrbanZoneDto) {
    return this.urbanZones.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.urbanZones.remove(id);
  }
}
