import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UnauthorizedException } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CaseAuctionService } from './case-auction.service';
import { CasesService } from './cases.service';
import { DecideCaseAuctionDto } from './dto/decide-case-auction.dto';
import { FindCasesQueryDto } from './dto/find-cases-query.dto';
import { OpenCaseRequestDto } from './dto/open-case-request.dto';
import { SaveCaseAuctionDto } from './dto/save-case-auction.dto';

type RequestUser = { id: string; isAdmin?: boolean; roleCodes?: string[] };

function auctionActor(user: RequestUser | undefined, required: true): NonNullable<ReturnType<typeof auctionActorOptional>>;
function auctionActor(user: RequestUser | undefined, required?: false): ReturnType<typeof auctionActorOptional>;
function auctionActor(user: RequestUser | undefined, required = false) {
  return auctionActorOptional(user, required);
}

function auctionActorOptional(user: RequestUser | undefined, required = false) {
  if (!user?.id) {
    if (required) throw new UnauthorizedException();
    return undefined;
  }
  return { id: user.id, isAdmin: user.isAdmin, roleCodes: user.roleCodes ?? [] };
}

@Controller('cases')
export class CaseRecordsController {
  constructor(
    private readonly cases: CasesService,
    private readonly auctions: CaseAuctionService,
  ) {}

  @Get()
  findAll(@Query() query: FindCasesQueryDto) {
    return this.cases.list(query);
  }

  @Get(':id/auction/:requestId')
  findAuction(
    @Param('id') id: string,
    @Param('requestId') requestId: string,
    @CurrentUser() user: RequestUser | undefined,
  ) {
    return this.auctions.find(id, requestId, auctionActor(user));
  }

  @Post(':id/auction')
  createAuction(
    @Param('id') id: string,
    @Body() dto: SaveCaseAuctionDto,
    @CurrentUser() user: RequestUser | undefined,
  ) {
    return this.auctions.create(id, dto, auctionActor(user, true));
  }

  @Patch(':id/auction/:requestId')
  updateAuction(
    @Param('id') id: string,
    @Param('requestId') requestId: string,
    @Body() dto: SaveCaseAuctionDto,
    @CurrentUser() user: RequestUser | undefined,
  ) {
    return this.auctions.update(id, requestId, dto, auctionActor(user, true));
  }

  @Post(':id/auction/:requestId/approvals/:approvalId')
  decideAuction(
    @Param('id') id: string,
    @Param('requestId') requestId: string,
    @Param('approvalId') approvalId: string,
    @Body() dto: DecideCaseAuctionDto,
    @CurrentUser() user: RequestUser | undefined,
  ) {
    return this.auctions.decide(id, requestId, approvalId, auctionActor(user, true), dto);
  }

  @Get(':id/license')
  license(@Param('id') id: string) {
    return this.cases.licenseDocument(id);
  }

  @Get(':id/process')
  processState(@Param('id') id: string) {
    return this.cases.processState(id);
  }

  @Post(':id/requests')
  openRequest(@Param('id') id: string, @Body() dto: OpenCaseRequestDto) {
    return this.cases.openRequest(id, dto.type);
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
