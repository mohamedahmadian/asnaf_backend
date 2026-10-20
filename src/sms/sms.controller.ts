import { Body, Controller, Get, Patch, Post, Query } from '@nestjs/common';
import { FindSmsHistoryQueryDto } from './dto/find-sms-history.dto';
import { SendSmsDto } from './dto/send-sms.dto';
import { UpdateSmsSettingsDto } from './dto/update-sms-settings.dto';
import { SmsSettingsService } from './sms-settings.service';
import { SmsService } from './sms.service';

@Controller('sms')
export class SmsController {
  constructor(
    private readonly settings: SmsSettingsService,
    private readonly sms: SmsService,
  ) {}

  @Get('settings')
  getSettings() {
    return this.settings.get();
  }

  @Patch('settings')
  updateSettings(@Body() dto: UpdateSmsSettingsDto) {
    return this.settings.update(dto);
  }

  @Get('history')
  listHistory(@Query() query: FindSmsHistoryQueryDto) {
    return this.sms.listHistory(query);
  }

  @Post('messages')
  async send(@Body() dto: SendSmsDto) {
    await this.sms.send({ phone: dto.phone, body: dto.body, source: 'MANUAL' });
    return { mocked: true };
  }
}
