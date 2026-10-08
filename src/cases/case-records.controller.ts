import { Controller, Delete, Get, Param, Query } from '@nestjs/common';
import { CasesService } from './cases.service';
import { FindCasesQueryDto } from './dto/find-cases-query.dto';

@Controller('cases')
export class CaseRecordsController {
  constructor(private readonly cases: CasesService) {}

  @Get()
  findAll(@Query() query: FindCasesQueryDto) {
    return this.cases.list(query);
  }

  @Get(':id/license')
  license(@Param('id') id: string) {
    return this.cases.licenseDocument(id);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.cases.findOne(id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.cases.remove(id);
  }
}
