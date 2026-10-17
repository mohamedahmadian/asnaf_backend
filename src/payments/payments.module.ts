import { Module } from '@nestjs/common';
import { ImagesModule } from '../images/images.module';
import { SmsModule } from '../sms/sms.module';
import { MellatGatewayService } from './mellat-gateway.service';
import { PaymentGroupsController } from './payment-groups.controller';
import { PaymentGroupsService } from './payment-groups.service';
import { PaymentHistoryController } from './payment-history.controller';
import { PaymentOnlineService } from './payment-online.service';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import {
  PaymentGatewayCallbackController,
  PublicPaymentsController,
} from './public-payments.controller';

@Module({
  imports: [ImagesModule, SmsModule],
  controllers: [
    PaymentsController,
    PaymentGroupsController,
    PaymentHistoryController,
    PublicPaymentsController,
    PaymentGatewayCallbackController,
  ],
  providers: [PaymentsService, PaymentGroupsService, MellatGatewayService, PaymentOnlineService],
})
export class PaymentsModule {}
