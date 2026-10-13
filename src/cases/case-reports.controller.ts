import { Controller, Get, Query } from '@nestjs/common';
import { FindExpiringCasesQueryDto } from './dto/find-expiring-cases-query.dto';
import { ExpiringCasesService } from './expiring-cases.service';

@Controller('cases/reports')
export class CaseReportsController {
  constructor(private readonly expiring: ExpiringCasesService) {}

  @Get('expiring')
  findExpiring(@Query() query: FindExpiringCasesQueryDto) {
    return this.expiring.list(query);
  }
}
