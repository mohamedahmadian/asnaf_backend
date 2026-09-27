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
import { CommercialFloorsService } from './commercial-floors.service';
import { CreateCommercialFloorDto } from './dto/create-commercial-floor.dto';
import { FindCommercialFloorsQueryDto } from './dto/find-commercial-floors-query.dto';
import { UpdateCommercialFloorDto } from './dto/update-commercial-floor.dto';

@Controller('commercial-complexes/:complexId/floors')
export class CommercialFloorsController {
  constructor(private readonly floors: CommercialFloorsService) {}

  @Get()
  findAll(
    @Param('complexId') complexId: string,
    @Query() query: FindCommercialFloorsQueryDto,
  ) {
    return this.floors.findAll(complexId, query);
  }

  @Post()
  create(
    @Param('complexId') complexId: string,
    @Body() dto: CreateCommercialFloorDto,
  ) {
    return this.floors.create(complexId, dto);
  }

  @Get(':id')
  findOne(@Param('complexId') complexId: string, @Param('id') id: string) {
    return this.floors.findOne(complexId, id);
  }

  @Patch(':id')
  update(
    @Param('complexId') complexId: string,
    @Param('id') id: string,
    @Body() dto: UpdateCommercialFloorDto,
  ) {
    return this.floors.update(complexId, id, dto);
  }

  @Delete(':id')
  remove(@Param('complexId') complexId: string, @Param('id') id: string) {
    return this.floors.remove(complexId, id);
  }
}
