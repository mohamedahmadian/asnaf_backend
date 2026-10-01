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
import { CaseInquiryChannel } from '../generated/prisma/client';
import { CaseInquiriesService } from './case-inquiries.service';
import { CasesService } from './cases.service';
import { SaveCaseActivityDto } from './dto/save-case-activity.dto';
import { SaveCaseLocationDto } from './dto/save-case-location.dto';
import { SaveCaseIdentityDto } from './dto/save-case-identity.dto';
import { SaveFormationStepDto } from './dto/save-formation-step.dto';

type UploadFile = {
  buffer: Buffer;
  size: number;
  mimetype: string;
  originalname: string;
};

type RequestUser = { id: string; isAdmin?: boolean };

function formationActor(user: RequestUser | undefined) {
  if (!user?.id) throw new UnauthorizedException();
  return { id: user.id, isAdmin: user.isAdmin, formation: true };
}

const inquiryFile = FileInterceptor('file', {
  storage: memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
});

@Controller('cases/formation')
export class CasesController {
  constructor(
    private readonly cases: CasesService,
    private readonly inquiries: CaseInquiriesService,
  ) {}

  @Get('identity')
  findIdentity(@Query('nationalId') nationalId = '') {
    return this.cases.findIdentity(nationalId);
  }

  @Post('identity')
  saveIdentity(@Body() dto: SaveCaseIdentityDto) {
    return this.cases.saveIdentity(dto);
  }

  @Post('activity')
  saveActivity(@Body() dto: SaveCaseActivityDto) {
    return this.cases.saveActivity(dto);
  }

  @Post('location')
  saveLocation(@Body() dto: SaveCaseLocationDto) {
    return this.cases.saveLocation(dto);
  }

  @Post('step')
  advanceStep(@Body() dto: SaveFormationStepDto) {
    return this.cases.advanceStep(dto);
  }

  @Get('inquiries')
  caseInquiries(@Query('userId') userId = '') {
    return this.inquiries.listForCase(userId);
  }

  @Post('inquiries/:id/decision')
  @UseInterceptors(inquiryFile)
  decideInquiry(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser | undefined,
    @UploadedFile() file: UploadFile | undefined,
    @Body('status') status = '',
    @Body('note') note?: string,
  ) {
    const saved = await this.inquiries.decide(id, formationActor(user), {
      status,
      note,
      channel: CaseInquiryChannel.MANUAL,
      file: file?.buffer
        ? { buffer: file.buffer, mimeType: file.mimetype, originalName: file.originalname }
        : undefined,
    });
    await this.advancePlacesQuietly(id);
    return saved;
  }

  @Post('inquiries/:id/reopen')
  reopenInquiry(@Param('id') id: string) {
    return this.inquiries.reopen(id);
  }

  private async advancePlacesQuietly(inquiryId: string) {
    try {
      await this.cases.advanceToPlacesAfterInquiry(inquiryId);
    } catch (error) {
      if (error instanceof BadRequestException) return;
      throw error;
    }
  }

  @Get('document-types')
  documentTypes() {
    return this.cases.documentTypes();
  }

  @Get('documents')
  personDocuments(@Query('userId') userId = '') {
    return this.cases.personDocuments(userId);
  }

  @Post('documents')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 8 * 1024 * 1024 },
    }),
  )
  uploadDocument(
    @UploadedFile() file: UploadFile,
    @Body('userId') userId: string,
    @Body('documentId') documentId: string,
    @Body('jobId') jobId?: string,
  ) {
    return this.cases.uploadDocument({
      userId,
      documentId,
      jobId: jobId?.trim() || undefined,
      buffer: file?.buffer,
      mimeType: file?.mimetype,
      originalName: file?.originalname,
    });
  }

  @Get('documents/:versionId/file')
  async file(@Param('versionId') versionId: string, @Res() res: Response) {
    const file = await this.cases.readDocumentFile(versionId);
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Length', String(file.byteSize));
    if (file.originalName) {
      res.setHeader(
        'Content-Disposition',
        `inline; filename="${encodeURIComponent(file.originalName)}"`,
      );
    }
    res.send(file.data);
  }
}
