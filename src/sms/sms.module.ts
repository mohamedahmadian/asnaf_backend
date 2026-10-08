import { Module } from '@nestjs/common';
import { SmsController } from './sms.controller';
import { SmsSettingsService } from './sms-settings.service';
import { SmsService } from './sms.service';

@Module({
  controllers: [SmsController],
  providers: [SmsService, SmsSettingsService],
  exports: [SmsService],
})
export class SmsModule {}
