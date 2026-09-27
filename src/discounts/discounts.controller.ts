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
import { DiscountsService } from './discounts.service';
import { CreateDiscountDto } from './dto/create-discount.dto';
import { FindDiscountsQueryDto } from './dto/find-discounts-query.dto';
import { UpdateDiscountDto } from './dto/update-discount.dto';

@Controller('discounts')
export class DiscountsController {
  constructor(private readonly discounts: DiscountsService) {}

  @Get()
  findAll(@Query() query: FindDiscountsQueryDto) {
    return this.discounts.findAll(query);
  }

  @Post()
  create(@Body() dto: CreateDiscountDto) {
    return this.discounts.create(dto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.discounts.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateDiscountDto) {
    return this.discounts.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.discounts.remove(id);
  }
}
