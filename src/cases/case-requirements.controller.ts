import { Body, Controller, Get, Put, Query } from '@nestjs/common';
import { CaseRequirementsService } from './case-requirements.service';
import { SaveCaseRequirementsDto } from './dto/save-case-requirements.dto';

@Controller('cases/settings/requirements')
export class CaseRequirementsController {
  constructor(private readonly requirements: CaseRequirementsService) {}

  @Get()
  get(@Query('requestType') requestType = 'ISSUANCE', @Query('jobId') jobId = '') {
    return this.requirements.get(requestType, jobId || undefined);
  }

  @Put()
  save(@Body() dto: SaveCaseRequirementsDto, @Query('jobId') jobId = '') {
    return this.requirements.save(dto, jobId || undefined);
  }
}
