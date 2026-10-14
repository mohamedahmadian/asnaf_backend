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
import { CaseLetterheadService } from '../cases/case-letterhead.service';
import { CreateInquiryCenterDto } from './dto/create-inquiry-center.dto';
import { CreateInquiryCenterOfficerDto } from './dto/create-inquiry-center-officer.dto';
import { FindInquiryCentersQueryDto } from './dto/find-inquiry-centers-query.dto';
import { UpdateInquiryCenterDto } from './dto/update-inquiry-center.dto';
import { InquiryCentersService } from './inquiry-centers.service';

@Controller('inquiry-centers')
export class InquiryCentersController {
  constructor(
    private readonly centers: InquiryCentersService,
    private readonly letterhead: CaseLetterheadService,
  ) {}

  @Get()
  findAll(@Query() query: FindInquiryCentersQueryDto) {
    return this.centers.findAll(query);
  }

  @Get('letterhead')
  letterheadView() {
    return this.letterhead.view();
  }

  @Post()
  create(@Body() dto: CreateInquiryCenterDto) {
    return this.centers.create(dto);
  }

  @Post('officers')
  createOfficer(@Body() dto: CreateInquiryCenterOfficerDto) {
    return this.centers.createOfficer(dto);
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
