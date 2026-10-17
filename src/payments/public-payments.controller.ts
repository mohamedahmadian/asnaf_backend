import { Body, Controller, Get, Param, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { PaymentOnlineService } from './payment-online.service';

@Controller('public/payments')
export class PublicPaymentsController {
  constructor(private readonly online: PaymentOnlineService) {}

  @Get(':token')
  summary(@Param('token') token: string) {
    return this.online.publicSummary(token);
  }

  @Post(':token/gateway')
  start(@Param('token') token: string) {
    return this.online.startForPublic(token);
  }
}

@Controller('public/payment-gateway')
export class PaymentGatewayCallbackController {
  constructor(private readonly online: PaymentOnlineService) {}

  @Post('mellat/callback')
  async mellatCallback(@Body() body: Record<string, unknown>, @Res() res: Response) {
    const target = await this.online.handleMellatCallback(body ?? {});
    res.redirect(303, target);
  }
}
