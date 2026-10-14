import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
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
import { assertAdminActor, assertCanIssue } from './case-action-access';
import { CaseInquiryChannel } from '../generated/prisma/client';
import { CaseInquiriesService } from './case-inquiries.service';
import { CaseManagementApproversService } from './case-management-approvers.service';
import { CasePlacesService } from './case-places.service';
import { CasesService } from './cases.service';
import { SaveCaseActivityDto } from './dto/save-case-activity.dto';
import { SaveCaseLocationDto } from './dto/save-case-location.dto';
import { SaveCaseIdentityDto } from './dto/save-case-identity.dto';
import { SaveFormationStepDto } from './dto/save-formation-step.dto';
import { SaveRenewalDatesDto } from './dto/save-renewal-dates.dto';
import { UpdateCaseLetterIssueDto } from './dto/update-case-letter-issue.dto';

type UploadFile = {
  buffer: Buffer;
  size: number;
  mimetype: string;
  originalname: string;
};

type RequestUser = { id: string; isAdmin?: boolean; permissionCodes?: string[] };

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
  saveIdentity(@Body() dto: SaveCaseIdentityDto, @CurrentUser() user: RequestUser | undefined) {
    if (!user?.id) throw new UnauthorizedException();
    return this.cases.saveIdentity(dto, user.id);
  }

  @Post('activity')
  saveActivity(@Body() dto: SaveCaseActivityDto, @CurrentUser() user: RequestUser | undefined) {
    if (!user?.id) throw new UnauthorizedException();
    return this.cases.saveActivity(dto, user.id);
  }

  @Post('location')
  saveLocation(@Body() dto: SaveCaseLocationDto, @CurrentUser() user: RequestUser | undefined) {
    if (!user?.id) throw new UnauthorizedException();
    return this.cases.saveLocation(dto, user.id);
  }

  @Get('activity-requirements')
  activityRequirements(
    @Query('caseId') caseId = '',
    @Query('jobId') jobId = '',
    @Query('requestType') requestType = '',
    @Query('requestId') requestId = '',
  ) {
    return this.cases.activityRequirements(
      caseId,
      jobId || undefined,
      requestType || undefined,
      requestId || undefined,
    );
  }

  @Post('location-draft')
  saveLocationDraft(@Body() dto: SaveCaseLocationDto, @CurrentUser() user: RequestUser | undefined) {
    return this.cases.saveLocationDraft(dto, user?.id);
  }

  @Post('renewal-dates')
  saveRenewalDates(@Body() dto: SaveRenewalDatesDto, @CurrentUser() user: RequestUser | undefined) {
    return this.cases.saveRenewalDates(dto.caseId, dto.nextIssuedAt, dto.nextExpiresAt, user?.id, dto.requestId);
  }

  @Post('process-step')
  advanceProcess(@Body() dto: SaveFormationStepDto, @CurrentUser() user: RequestUser | undefined) {
    return this.cases.advanceProcess(dto.caseId, dto.step, user);
  }

  @Post('complete')
  complete(@Body() dto: SaveFormationStepDto, @CurrentUser() user: RequestUser | undefined) {
    const actor = assertCanIssue(user);
    return this.cases.completeRequest(dto.caseId, actor.id, dto.licenseIssuedAt, dto.licenseExpiresAt);
  }

  @Post('step')
  advanceStep(@Body() dto: SaveFormationStepDto, @CurrentUser() user: RequestUser | undefined) {
    return this.cases.advanceStep(dto, user);
  }

  @Get('inquiries')
  caseInquiries(@Query('caseId') caseId = '', @Query('requestId') requestId = '') {
    return this.inquiries.listForCase(caseId, requestId || undefined);
  }

  @Get('places')
  casePlaces(@Query('caseId') caseId = '', @Query('requestId') requestId = '') {
    return this.places.listForCase(caseId, requestId || undefined);
  }

  @Get('management-approvers')
  caseManagementApprovers(@Query('caseId') caseId = '', @Query('requestId') requestId = '') {
    return this.managementApprovers.listForCase(caseId, requestId || undefined);
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
  async decideManagementReview(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser | undefined,
    @UploadedFile() file: UploadFile | undefined,
    @Body('status') status = '',
    @Body('note') note?: string,
  ) {
    const actor = formationActor(user);
    const saved = await this.managementApprovers.decide(id, actor, {
      status,
      note,
      channel: CaseInquiryChannel.MANUAL,
      file: file?.buffer
        ? { buffer: file.buffer, mimeType: file.mimetype, originalName: file.originalname }
        : undefined,
    });
    await this.managementApprovers.advanceAfterDecision(id);
    return saved;
  }

  @Post('management-reviews/:id/reopen')
  reopenManagementReview(@Param('id') id: string, @CurrentUser() user: RequestUser | undefined) {
    const actor = assertAdminActor(user);
    return this.managementApprovers.reopen(id, actor.id);
  }

  @Get('places/:id/letter')
  placesLetter(@Param('id') id: string, @CurrentUser() user: RequestUser | undefined) {
    return this.places.letter(id, formationActor(user));
  }

  @Put('places/:id/letter')
  updatePlacesLetter(
    @Param('id') id: string,
    @Body() dto: UpdateCaseLetterIssueDto,
    @CurrentUser() user: RequestUser | undefined,
  ) {
    return this.places.updateLetter(id, formationActor(user), dto);
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
  reopenPlaces(@Param('id') id: string, @CurrentUser() user: RequestUser | undefined) {
    const actor = assertAdminActor(user);
    return this.places.reopen(id, actor.id);
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
  reopenInquiry(@Param('id') id: string, @CurrentUser() user: RequestUser | undefined) {
    const actor = assertAdminActor(user);
    return this.inquiries.reopen(id, actor.id);
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

  @Get('activity-documents')
  activityDocuments(@Query('caseId') caseId = '', @Query('requestId') requestId = '') {
    return this.cases.activityDocuments(caseId, requestId || undefined);
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
    @Body('caseId') caseId?: string,
    @Body('requestId') requestId?: string,
    @Body('jobId') jobId?: string,
    @Body('editCaseId') editCaseId?: string,
    @CurrentUser() user?: RequestUser,
  ) {
    return this.cases.uploadDocument({
      userId,
      documentId,
      caseId: caseId?.trim() || undefined,
      requestId: requestId?.trim() || undefined,
      jobId: jobId?.trim() || undefined,
      editCaseId: editCaseId?.trim() || undefined,
      actorId: user?.id,
      buffer: file?.buffer,
      mimeType: file?.mimetype,
      originalName: file?.originalname,
    });
  }

  @Delete('documents/:documentId')
  removeDocument(
    @Param('documentId') documentId: string,
    @Query('userId') userId = '',
    @Query('caseId') caseId = '',
    @Query('requestId') requestId = '',
    @Query('editCaseId') editCaseId = '',
    @CurrentUser() user: RequestUser | undefined,
  ) {
    if (caseId) {
      return this.cases.removeActivityDocument(caseId, documentId, requestId || undefined, user?.id);
    }
    return this.cases.removeDocument(userId, documentId, {
      editCaseId: editCaseId || undefined,
      actorId: user?.id,
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
