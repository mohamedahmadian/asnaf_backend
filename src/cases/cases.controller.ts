import {
  BadRequestException,
  Body,
  Controller,
  Delete,
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
import { CaseManagementApproversService } from './case-management-approvers.service';
import { CasePlacesService } from './case-places.service';
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
    private readonly places: CasePlacesService,
    private readonly managementApprovers: CaseManagementApproversService,
  ) {}

  @Get('identity')
  findIdentity(@Query('nationalId') nationalId = '', @Query('caseId') caseId = '') {
    return this.cases.findIdentity(nationalId, caseId || undefined);
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
  caseInquiries(@Query('caseId') caseId = '') {
    return this.inquiries.listForCase(caseId);
  }

  @Get('places')
  casePlaces(@Query('caseId') caseId = '') {
    return this.places.listForCase(caseId);
  }

  @Get('management-approvers')
  caseManagementApprovers(@Query('caseId') caseId = '') {
    return this.managementApprovers.listForCase(caseId);
  }

  @Get('management-reviews/files/:fileId')
  async managementReviewFile(@Param('fileId') fileId: string, @Res() res: Response) {
    const file = await this.managementApprovers.readFile(fileId);
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Length', String(file.byteSize));
    if (file.originalName) {
      res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(file.originalName)}"`);
    }
    res.send(file.data);
  }

  @Post('management-reviews/:id/decision')
  @UseInterceptors(inquiryFile)
  decideManagementReview(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser | undefined,
    @UploadedFile() file: UploadFile | undefined,
    @Body('status') status = '',
    @Body('note') note?: string,
  ) {
    const actor = formationActor(user);
    return this.managementApprovers.decide(id, actor.id, {
      status,
      note,
      channel: CaseInquiryChannel.MANUAL,
      file: file?.buffer
        ? { buffer: file.buffer, mimeType: file.mimetype, originalName: file.originalname }
        : undefined,
    });
  }

  @Post('management-reviews/:id/reopen')
  reopenManagementReview(@Param('id') id: string) {
    return this.managementApprovers.reopen(id);
  }

  @Get('places/:id/letter')
  placesLetter(@Param('id') id: string, @CurrentUser() user: RequestUser | undefined) {
    return this.places.letter(id, formationActor(user));
  }

  @Post('places/:id/decision')
  @UseInterceptors(inquiryFile)
  async decidePlaces(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser | undefined,
    @UploadedFile() file: UploadFile | undefined,
    @Body('status') status = '',
    @Body('note') note?: string,
  ) {
    const saved = await this.places.decide(id, formationActor(user), {
      status,
      note,
      channel: CaseInquiryChannel.MANUAL,
      file: file?.buffer
        ? { buffer: file.buffer, mimeType: file.mimetype, originalName: file.originalname }
        : undefined,
    });
    try {
      await this.places.advanceAfterDecision(id);
    } catch (error) {
      if (!(error instanceof BadRequestException)) throw error;
    }
    return saved;
  }

  @Post('places/:id/reopen')
  reopenPlaces(@Param('id') id: string) {
    return this.places.reopen(id);
  }

  @Post('inquiries/:id/decision')
  @UseInterceptors(inquiryFile)
  async decideInquiry(
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

  @Delete('documents/:documentId')
  removeDocument(@Param('documentId') documentId: string, @Query('userId') userId = '') {
    return this.cases.removeDocument(userId, documentId);
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
