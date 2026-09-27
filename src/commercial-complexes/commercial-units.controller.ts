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
import { CommercialUnitsService } from './commercial-units.service';
import { CreateCommercialUnitDto } from './dto/create-commercial-unit.dto';
import { FindCommercialUnitsQueryDto } from './dto/find-commercial-units-query.dto';
import { UpdateCommercialUnitDto } from './dto/update-commercial-unit.dto';

@Controller(
  'commercial-complexes/:complexId/floors/:floorId/lanes/:laneId/units',
)
export class CommercialUnitsController {
  constructor(private readonly units: CommercialUnitsService) {}

  @Get()
  findAll(
    @Param('complexId') complexId: string,
    @Param('floorId') floorId: string,
    @Param('laneId') laneId: string,
    @Query() query: FindCommercialUnitsQueryDto,
  ) {
    return this.units.findAll(complexId, floorId, laneId, query);
  }

  @Post()
  create(
    @Param('complexId') complexId: string,
    @Param('floorId') floorId: string,
    @Param('laneId') laneId: string,
    @Body() dto: CreateCommercialUnitDto,
  ) {
    return this.units.create(complexId, floorId, laneId, dto);
  }

  @Get(':id')
  findOne(
    @Param('complexId') complexId: string,
    @Param('floorId') floorId: string,
    @Param('laneId') laneId: string,
    @Param('id') id: string,
  ) {
    return this.units.findOne(complexId, floorId, laneId, id);
  }

  @Patch(':id')
  update(
    @Param('complexId') complexId: string,
    @Param('floorId') floorId: string,
    @Param('laneId') laneId: string,
    @Param('id') id: string,
    @Body() dto: UpdateCommercialUnitDto,
  ) {
    return this.units.update(complexId, floorId, laneId, id, dto);
  }

  @Delete(':id')
  remove(
    @Param('complexId') complexId: string,
    @Param('floorId') floorId: string,
    @Param('laneId') laneId: string,
    @Param('id') id: string,
  ) {
    return this.units.remove(complexId, floorId, laneId, id);
  }
}
