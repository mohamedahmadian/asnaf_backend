import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { assertCanIssue, type ActionUser } from './case-action-access';
import { CasesService } from './cases.service';
import { FindIssuanceQueryDto } from './dto/find-issuance-query.dto';
import { SaveFormationStepDto } from './dto/save-formation-step.dto';

@Controller('cases/issuance')
export class CaseIssuanceController {
  constructor(private readonly cases: CasesService) {}

  @Get()
  inbox(@Query() query: FindIssuanceQueryDto) {
    return this.cases.listReadyToIssue(query);
  }

  @Post('complete')
  complete(@Body() dto: SaveFormationStepDto, @CurrentUser() user: ActionUser | undefined) {
    const actor = assertCanIssue(user);
    return this.cases.completeRequest(dto.caseId, actor.id, dto.licenseIssuedAt, dto.licenseExpiresAt);
  }
}
