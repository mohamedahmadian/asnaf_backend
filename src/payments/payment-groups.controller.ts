import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { SavePaymentGroupDto } from './dto/save-payment-group.dto';
import { PaymentGroupsService } from './payment-groups.service';

@Controller('payment-groups')
export class PaymentGroupsController {
  constructor(private readonly groups: PaymentGroupsService) {}

  @Get()
  findAll() {
    return this.groups.findAll();
  }

  @Post()
  create(@Body() dto: SavePaymentGroupDto) {
    return this.groups.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: SavePaymentGroupDto) {
    return this.groups.update(id, dto);
  }

  @Post(':id/default')
  setDefault(@Param('id') id: string) {
    return this.groups.setDefault(id);
  }

  @Delete(':id/default')
  clearDefault(@Param('id') id: string) {
    return this.groups.clearDefault(id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.groups.remove(id);
  }
}
