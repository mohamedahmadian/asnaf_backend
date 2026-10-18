import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { CaseFinanceService } from './case-finance.service';
import { SaveCaseRequestFeesDto } from './dto/save-case-request-fees.dto';

@Controller('case-finance')
export class CaseFinanceController {
  constructor(private readonly finance: CaseFinanceService) {}

  @Get(':caseId/all')
  getAll(@Param('caseId', ParseUUIDPipe) caseId: string) {
    return this.finance.getAll(caseId);
  }

  @Get(':caseId')
  get(
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Query('requestId') requestId?: string,
  ) {
    return this.finance.get(caseId, requestId || undefined);
  }

  @Put(':caseId/fees')
  saveFees(
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Body() dto: SaveCaseRequestFeesDto,
    @Query('requestId') requestId?: string,
  ) {
    return this.finance.saveFees(caseId, requestId || undefined, dto);
  }

  @Post(':caseId/reset')
  reset(
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Query('requestId') requestId?: string,
  ) {
    return this.finance.reset(caseId, requestId || undefined);
  }
}
