import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CaseRevocationProcessService } from './case-revocation-process.service';
import {
  CompleteCaseRevocationDto,
  SaveCaseRevocationAmountDto,
} from './dto/case-revocation-process.dto';

type RequestUser = {
  id: string;
};

@Controller('cases/:caseId/revocation-process')
export class CaseRevocationProcessController {
  constructor(private readonly process: CaseRevocationProcessService) {}

  @Get()
  state(@Param('caseId') caseFileId: string) {
    return this.process.state(caseFileId);
  }

  @Put('amount')
  saveAmount(
    @Param('caseId') caseFileId: string,
    @Body() dto: SaveCaseRevocationAmountDto,
  ) {
    return this.process.saveAmount(caseFileId, dto);
  }

  @Get('letters/:letterId')
  letter(
    @Param('caseId') caseFileId: string,
    @Param('letterId') letterId: string,
  ) {
    return this.process.letter(caseFileId, letterId);
  }

  @Post('complete')
  complete(
    @Param('caseId') caseFileId: string,
    @Body() dto: CompleteCaseRevocationDto,
    @CurrentUser() user: RequestUser | undefined,
  ) {
    return this.process.complete(caseFileId, dto, user?.id);
  }
}
