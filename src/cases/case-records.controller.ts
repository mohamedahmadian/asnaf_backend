import { Controller, Get, Query } from '@nestjs/common';
import { CasesService } from './cases.service';
import { FindCasesQueryDto } from './dto/find-cases-query.dto';

@Controller('cases')
export class CaseRecordsController {
  constructor(private readonly cases: CasesService) {}

  @Get()
  findAll(@Query() query: FindCasesQueryDto) {
    return this.cases.list(query);
  }
}
