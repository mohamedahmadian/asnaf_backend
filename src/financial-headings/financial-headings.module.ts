import { Module } from '@nestjs/common';
import { FinancialHeadingsController } from './financial-headings.controller';
import { FinancialHeadingsService } from './financial-headings.service';

@Module({
  controllers: [FinancialHeadingsController],
  providers: [FinancialHeadingsService],
})
export class FinancialHeadingsModule {}
