import { Body, Controller, Get, Param, ParseUUIDPipe, Put, Query } from '@nestjs/common';
import { CaseExpiryService } from './case-expiry.service';
import { FindCaseExpiryQueryDto } from './dto/find-case-expiry-query.dto';
import { SaveCaseExpiryDto } from './dto/save-case-expiry.dto';

@Controller('case-expiry')
export class CaseExpiryController {
  constructor(private readonly caseExpiry: CaseExpiryService) {}

  @Get()
  list(@Query() query: FindCaseExpiryQueryDto) {
    return this.caseExpiry.list(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.caseExpiry.findOne(id);
  }

  @Put(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SaveCaseExpiryDto) {
    return this.caseExpiry.update(id, dto.expiresAt);
  }
}
