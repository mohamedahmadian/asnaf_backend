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
import { CommercialLanesService } from './commercial-lanes.service';
import { CreateCommercialLaneDto } from './dto/create-commercial-lane.dto';
import { FindCommercialLanesQueryDto } from './dto/find-commercial-lanes-query.dto';
import { UpdateCommercialLaneDto } from './dto/update-commercial-lane.dto';

@Controller('commercial-complexes/:complexId/floors/:floorId/lanes')
export class CommercialLanesController {
  constructor(private readonly lanes: CommercialLanesService) {}

  @Get()
  findAll(
    @Param('complexId') complexId: string,
    @Param('floorId') floorId: string,
    @Query() query: FindCommercialLanesQueryDto,
  ) {
    return this.lanes.findAll(complexId, floorId, query);
  }

  @Post()
  create(
    @Param('complexId') complexId: string,
    @Param('floorId') floorId: string,
    @Body() dto: CreateCommercialLaneDto,
  ) {
    return this.lanes.create(complexId, floorId, dto);
  }

  @Get(':id')
  findOne(
    @Param('complexId') complexId: string,
    @Param('floorId') floorId: string,
    @Param('id') id: string,
  ) {
    return this.lanes.findOne(complexId, floorId, id);
  }

  @Patch(':id')
  update(
    @Param('complexId') complexId: string,
    @Param('floorId') floorId: string,
    @Param('id') id: string,
    @Body() dto: UpdateCommercialLaneDto,
  ) {
    return this.lanes.update(complexId, floorId, id, dto);
  }

  @Delete(':id')
  remove(
    @Param('complexId') complexId: string,
    @Param('floorId') floorId: string,
    @Param('id') id: string,
  ) {
    return this.lanes.remove(complexId, floorId, id);
  }
}
