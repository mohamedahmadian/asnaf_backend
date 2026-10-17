import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { DeletePaymentDto } from './dto/delete-payment.dto';
import { FindPaymentsQueryDto } from './dto/find-payments-query.dto';
import { PaymentsService } from './payments.service';

type ReceiptUpload = {
  buffer: Buffer;
  size: number;
  mimetype: string;
  originalname: string;
};

@Controller('payment-history')
export class PaymentHistoryController {
  constructor(private readonly payments: PaymentsService) {}

  @Get()
  findAll(@Query() query: FindPaymentsQueryDto) {
    return this.payments.findHistory(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.payments.findOne(id);
  }

  @Delete(':id')
  remove(
    @Param('id') id: string,
    @Body() dto: DeletePaymentDto,
    @CurrentUser() user?: { id: string },
  ) {
    return this.payments.remove(id, dto.reason, user?.id);
  }

  @Post(':id/receipts')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 8 * 1024 * 1024 },
    }),
  )
  addReceipt(
    @Param('id') id: string,
    @UploadedFile() file: ReceiptUpload | undefined,
    @CurrentUser() user?: { id: string },
  ) {
    return this.payments.addReceipt(id, file, user?.id);
  }

  @Delete(':id/receipts/:receiptId')
  removeReceipt(@Param('id') id: string, @Param('receiptId') receiptId: string) {
    return this.payments.removeReceipt(id, receiptId);
  }
}
