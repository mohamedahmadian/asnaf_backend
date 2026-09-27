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
import { CreateInquiryCenterDto } from './dto/create-inquiry-center.dto';
import { FindInquiryCentersQueryDto } from './dto/find-inquiry-centers-query.dto';
import { UpdateInquiryCenterDto } from './dto/update-inquiry-center.dto';
import { InquiryCentersService } from './inquiry-centers.service';

@Controller('inquiry-centers')
export class InquiryCentersController {
  constructor(private readonly centers: InquiryCentersService) {}

  @Get()
  findAll(@Query() query: FindInquiryCentersQueryDto) {
    return this.centers.findAll(query);
  }

  @Post()
  create(@Body() dto: CreateInquiryCenterDto) {
    return this.centers.create(dto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.centers.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateInquiryCenterDto) {
    return this.centers.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.centers.remove(id);
  }
}
