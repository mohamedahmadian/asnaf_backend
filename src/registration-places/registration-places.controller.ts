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
import { CreateRegistrationPlaceDto } from './dto/create-registration-place.dto';
import { FindRegistrationPlacesQueryDto } from './dto/find-registration-places-query.dto';
import { UpdateRegistrationPlaceDto } from './dto/update-registration-place.dto';
import { RegistrationPlacesService } from './registration-places.service';

@Controller('registration-places')
export class RegistrationPlacesController {
  constructor(private readonly registrationPlaces: RegistrationPlacesService) {}

  @Get()
  findAll(@Query() query: FindRegistrationPlacesQueryDto) {
    return this.registrationPlaces.findAll(query);
  }

  @Post()
  create(@Body() dto: CreateRegistrationPlaceDto) {
    return this.registrationPlaces.create(dto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.registrationPlaces.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateRegistrationPlaceDto) {
    return this.registrationPlaces.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.registrationPlaces.remove(id);
  }
}
