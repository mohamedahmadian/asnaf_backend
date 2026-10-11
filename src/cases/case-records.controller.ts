import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UnauthorizedException,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CaseAuctionService } from './case-auction.service';
import { CasesService } from './cases.service';
import { DecideCaseAuctionDto } from './dto/decide-case-auction.dto';
import { FindCasesQueryDto } from './dto/find-cases-query.dto';
import { OpenCaseRequestDto } from './dto/open-case-request.dto';
import { SaveCaseAuctionDto } from './dto/save-case-auction.dto';
import { LiftCaseSuspensionDto } from './dto/lift-case-suspension.dto';
import { RevokeCaseDto } from './dto/revoke-case.dto';
import { SuspendCaseDto } from './dto/suspend-case.dto';

type UploadFile = {
  buffer: Buffer;
  size: number;
  mimetype: string;
  originalname: string;
};

const suspensionFile = FileInterceptor('file', {
  storage: memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
});

function suspensionUpload(file: UploadFile | undefined) {
  if (!file?.buffer?.length) return undefined;
  return { buffer: file.buffer, mimeType: file.mimetype, originalName: file.originalname };
}

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

  @Post(':id/auction/:requestId/issue')
  issueAuction(
    @Param('id') id: string,
    @Param('requestId') requestId: string,
    @CurrentUser() user: RequestUser | undefined,
  ) {
    return this.auctions.issue(id, requestId, auctionActor(user, true));
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

  @Get(':id/renewal/:requestId')
  renewalView(@Param('id') id: string, @Param('requestId') requestId: string) {
    return this.cases.renewalView(id, requestId);
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

  @Delete(':id/requests/:requestId')
  removeRequest(
    @Param('id') id: string,
    @Param('requestId') requestId: string,
    @CurrentUser() user: RequestUser | undefined,
  ) {
    return this.cases.removeRequest(id, requestId, user?.id ? { id: user.id, isAdmin: user.isAdmin } : undefined);
  }

  @Post(':id/reactivation')
  reactivate(@Param('id') id: string) {
    return this.cases.reactivate(id);
  }

  @Post(':id/revocation')
  revoke(
    @Param('id') id: string,
    @Body() dto: RevokeCaseDto,
    @CurrentUser() user: RequestUser | undefined,
  ) {
    return this.cases.revoke(id, dto, user?.id);
  }

  @Get('suspensions/files/:fileId')
  async suspensionFile(@Param('fileId') fileId: string, @Res() res: Response) {
    const file = await this.cases.readSuspensionFile(fileId);
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Length', String(file.byteSize));
    if (file.originalName) {
      res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(file.originalName)}"`);
    }
    res.send(file.data);
  }

  @Post(':id/suspensions/lift')
  @UseInterceptors(suspensionFile)
  liftSuspension(
    @Param('id') id: string,
    @Body() dto: LiftCaseSuspensionDto,
    @UploadedFile() file: UploadFile | undefined,
  ) {
    return this.cases.liftSuspension(id, dto, suspensionUpload(file));
  }

  @Post(':id/suspensions')
  @UseInterceptors(suspensionFile)
  suspend(
    @Param('id') id: string,
    @Body() dto: SuspendCaseDto,
    @CurrentUser() user: RequestUser | undefined,
    @UploadedFile() file: UploadFile | undefined,
  ) {
    return this.cases.suspend(id, dto, user?.id, suspensionUpload(file));
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
