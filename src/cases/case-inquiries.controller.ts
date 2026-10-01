import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
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
import { hasPermission } from '../access/access.util';
import { CaseInquiryChannel } from '../generated/prisma/client';
import { CaseInquiriesService, type InquiryActor } from './case-inquiries.service';
import { CasesService } from './cases.service';
import { FindCaseInquiriesQueryDto } from './dto/find-case-inquiries-query.dto';

type UploadFile = {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
};

type RequestUser = {
  id: string;
  isAdmin?: boolean;
  permissionCodes?: string[];
};

function actorOf(user: RequestUser | undefined): InquiryActor {
  if (!user?.id) throw new UnauthorizedException();
  return {
    id: user.id,
    isAdmin: user.isAdmin,
    formation:
      user.isAdmin ||
      hasPermission(
        { isAdmin: Boolean(user.isAdmin), permissionCodes: user.permissionCodes ?? [] },
        'cases.formation',
      ),
  };
}

@Controller('cases/inquiries')
export class CaseInquiriesController {
  constructor(
    private readonly inquiries: CaseInquiriesService,
    private readonly cases: CasesService,
  ) {}

  @Get()
  inbox(@CurrentUser() user: RequestUser | undefined, @Query() query: FindCaseInquiriesQueryDto) {
    return this.inquiries.inbox(actorOf(user), query);
  }

  @Get('files/:fileId')
  async file(
    @Param('fileId') fileId: string,
    @CurrentUser() user: RequestUser | undefined,
    @Res() res: Response,
  ) {
    const file = await this.inquiries.readFile(fileId, actorOf(user));
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Length', String(file.byteSize));
    if (file.originalName) {
      res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(file.originalName)}"`);
    }
    res.send(file.data);
  }

  @Get(':id/letter')
  letter(@Param('id') id: string, @CurrentUser() user: RequestUser | undefined) {
    return this.inquiries.letter(id, actorOf(user));
  }

  @Get(':id/dossier')
  dossier(@Param('id') id: string, @CurrentUser() user: RequestUser | undefined) {
    return this.inquiries.dossier(id, actorOf(user));
  }

  @Get(':id/documents/:versionId')
  async dossierFile(
    @Param('id') id: string,
    @Param('versionId') versionId: string,
    @CurrentUser() user: RequestUser | undefined,
    @Res() res: Response,
  ) {
    const file = await this.inquiries.readDossierFile(id, versionId, actorOf(user));
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Length', String(file.byteSize));
    if (file.originalName) {
      res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(file.originalName)}"`);
    }
    res.send(file.data);
  }

  @Get(':id')
  detail(@Param('id') id: string, @CurrentUser() user: RequestUser | undefined) {
    return this.inquiries.detail(id, actorOf(user));
  }

  @Post(':id/decision')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 8 * 1024 * 1024 },
    }),
  )
  async decide(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser | undefined,
    @UploadedFile() file: UploadFile | undefined,
    @Body('status') status = '',
    @Body('note') note?: string,
  ) {
    const saved = await this.inquiries.decide(id, actorOf(user), {
      status,
      note,
      channel: CaseInquiryChannel.SYSTEM,
      file: file?.buffer
        ? { buffer: file.buffer, mimeType: file.mimetype, originalName: file.originalname }
        : undefined,
    });
    try {
      await this.cases.advanceToPlacesAfterInquiry(id);
    } catch (error) {
      if (!(error instanceof BadRequestException)) throw error;
    }
    return saved;
  }
}
