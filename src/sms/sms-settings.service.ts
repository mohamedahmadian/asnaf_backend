import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateSmsSettingsDto } from './dto/update-sms-settings.dto';

const SETTINGS_KEY = 'default';

@Injectable()
export class SmsSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async get() {
    const row = await this.prisma.smsSettings.upsert({
      where: { singletonKey: SETTINGS_KEY },
      create: { singletonKey: SETTINGS_KEY },
      update: {},
    });
    return this.toView(row);
  }

  async update(dto: UpdateSmsSettingsDto) {
    await this.get();
    const row = await this.prisma.smsSettings.update({
      where: { singletonKey: SETTINGS_KEY },
      data: {
        isActive: dto.isActive,
        endpoint: dto.endpoint ?? null,
        senderNumber: dto.senderNumber ?? null,
        username: dto.username ?? null,
        ...(dto.password ? { password: dto.password } : {}),
      },
    });
    return this.toView(row);
  }

  private toView(row: {
    isActive: boolean;
    endpoint: string | null;
    senderNumber: string | null;
    username: string | null;
    password: string | null;
  }) {
    return {
      isActive: row.isActive,
      endpoint: row.endpoint,
      senderNumber: row.senderNumber,
      username: row.username,
      hasPassword: Boolean(row.password),
    };
  }
}
