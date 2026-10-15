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
import { CreateFinancialHeadingDto } from './dto/create-financial-heading.dto';
import { FindFinancialHeadingsQueryDto } from './dto/find-financial-headings-query.dto';
import { UpdateFinancialHeadingDto } from './dto/update-financial-heading.dto';
import { FinancialHeadingsService } from './financial-headings.service';

@Controller('financial-headings')
export class FinancialHeadingsController {
  constructor(private readonly financialHeadings: FinancialHeadingsService) {}

  @Get()
  findAll(@Query() query: FindFinancialHeadingsQueryDto) {
    return this.financialHeadings.findAll(query);
  }

  @Post()
  create(@Body() dto: CreateFinancialHeadingDto) {
    return this.financialHeadings.create(dto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.financialHeadings.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateFinancialHeadingDto) {
    return this.financialHeadings.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.financialHeadings.remove(id);
  }
}
