import { Module } from '@nestjs/common';
import { FinancialSettingsController } from './financial-settings.controller';
import { FinancialSettingsService } from './financial-settings.service';

@Module({
  controllers: [FinancialSettingsController],
  providers: [FinancialSettingsService],
})
export class FinancialSettingsModule {}
