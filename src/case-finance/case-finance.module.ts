import { Module } from '@nestjs/common';
import { CaseFinanceController } from './case-finance.controller';
import { CaseFinanceService } from './case-finance.service';

@Module({
  controllers: [CaseFinanceController],
  providers: [CaseFinanceService],
})
export class CaseFinanceModule {}
