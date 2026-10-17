import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { PaymentOnlineService } from './payment-online.service';
import { PaymentsService } from './payments.service';

type RequestUser = { id: string };

@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly online: PaymentOnlineService,
  ) {}

  @Get('parties')
  searchParties(@Query('q') q = '') {
    return this.payments.searchParties(q);
  }

  @Post()
  create(@Body() dto: CreatePaymentDto, @CurrentUser() user: RequestUser | undefined) {
    return this.payments.create(dto, user?.id);
  }

  @Post(':id/gateway')
  startGateway(@Param('id', ParseUUIDPipe) id: string) {
    return this.online.startForOperator(id);
  }

  @Post(':id/pay-link')
  renewPayLink(@Param('id', ParseUUIDPipe) id: string) {
    return this.online.renewPayLink(id);
  }
}
