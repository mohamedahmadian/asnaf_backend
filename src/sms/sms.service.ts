import { Injectable, Logger } from '@nestjs/common';

export type SendSmsInput = {
  phone: string;
  body: string;
};

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  /**
   * ارسال واقعی به درگاه هنوز وصل نیست.
   * تنظیمات ذخیره‌شده در SmsSettings بعداً همین‌جا خوانده می‌شود.
   */
  async send(input: SendSmsInput) {
    this.logger.warn(
      `SMS mock. Would send to ${input.phone} (${input.body.length} chars)`,
    );
    return {
      mocked: true,
      skipped: true,
      message: 'سرویس پیامک به‌زودی پیاده‌سازی می‌شود',
    };
  }
}
