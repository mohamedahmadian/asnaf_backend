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
import { SaveCaseIdentityDto } from '../cases/dto/save-case-identity.dto';
import { FindRentalLicensesQueryDto } from './dto/find-rental-licenses-query.dto';
import { SaveRentalLocationDto } from './dto/save-rental-location.dto';
import { SaveRentalStepDto } from './dto/save-rental-step.dto';
import { RentalLicensesService, type RentalActor } from './rental-licenses.service';

type UploadFile = {
  buffer: Buffer;
  size: number;
  mimetype: string;
  originalname: string;
};

type RequestUser = {
  id: string;
  isAdmin?: boolean;
  permissionCodes?: string[];
  roles?: { id: string }[];
};

function actor(user: RequestUser | undefined): RentalActor {
  if (!user?.id) throw new UnauthorizedException();
  return {
    id: user.id,
    isAdmin: user.isAdmin,
    permissionCodes: user.permissionCodes,
    roleIds: user.roles?.map((item) => item.id),
  };
}

const upload = FileInterceptor('file', {
  storage: memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
});

@Controller('rental-licenses')
export class RentalLicensesController {
  constructor(private readonly licenses: RentalLicensesService) {}

  @Get()
  list(@Query() query: FindRentalLicensesQueryDto) {
    return this.licenses.list(query);
  }

  @Get('formation/contract-years')
  contractYears() {
    return this.licenses.contractYears();
  }

  @Get('formation/identity')
  findIdentity(
    @Query('nationalId') nationalId = '',
    @Query('licenseId') licenseId = '',
    @CurrentUser() user?: RequestUser,
  ) {
    return this.licenses.findIdentity(nationalId, licenseId || undefined, actor(user));
  }

  @Post('formation/identity')
  saveIdentity(@Body() dto: SaveCaseIdentityDto, @CurrentUser() user: RequestUser | undefined) {
    return this.licenses.saveIdentity(dto, actor(user));
  }

  @Post('formation/location')
  saveLocation(@Body() dto: SaveRentalLocationDto, @CurrentUser() user: RequestUser | undefined) {
    return this.licenses.saveLocation(dto, actor(user));
  }

  @Get('formation/document-types')
  documentTypes() {
    return this.licenses.identityDocumentTypes();
  }

  @Get('formation/documents')
  documents(@Query('userId') userId = '') {
    if (!userId) throw new BadRequestException('شخص مشخص نیست');
    return this.licenses.personDocuments(userId);
  }

  @Get('formation/process-document-types')
  processDocumentTypes() {
    return this.licenses.processDocumentTypes();
  }

  @Get('formation/process-documents')
  processDocuments(@Query('licenseId') licenseId = '') {
    if (!licenseId) throw new BadRequestException('مجوز مشخص نیست');
    return this.licenses.processDocuments(licenseId);
  }

  @Post('formation/documents')
  @UseInterceptors(upload)
  uploadDocument(
    @UploadedFile() file: UploadFile,
    @Body('userId') userId: string,
    @Body('documentId') documentId: string,
    @Body('licenseId') licenseId: string,
    @Body('scope') scope: string,
    @CurrentUser() user?: RequestUser,
  ) {
    return this.licenses.uploadDocument({
      userId,
      documentId,
      licenseId: licenseId || undefined,
      scope,
      actor: actor(user),
      buffer: file?.buffer,
      mimeType: file?.mimetype,
      originalName: file?.originalname,
    });
  }

  @Delete('formation/documents/:documentId')
  removeDocument(
    @Param('documentId') documentId: string,
    @Query('userId') userId = '',
    @Query('licenseId') licenseId = '',
    @CurrentUser() user?: RequestUser,
  ) {
    if (!userId) throw new BadRequestException('شخص مشخص نیست');
    return this.licenses.removeDocument(documentId, userId, licenseId || undefined, actor(user));
  }

  @Get('formation/documents/:versionId/file')
  async personDocumentFile(@Param('versionId') versionId: string, @Res() res: Response) {
    sendFile(res, await this.licenses.readPersonDocumentFileByVersion(versionId));
  }

  @Get('formation/process-documents/:versionId/file')
  async processDocumentFile(@Param('versionId') versionId: string, @Res() res: Response) {
    sendFile(res, await this.licenses.readProcessDocumentFile(versionId));
  }

  @Post('formation/premise-files')
  @UseInterceptors(upload)
  uploadPremise(
    @UploadedFile() file: UploadFile,
    @Body('licenseId') licenseId: string,
    @Body('kind') kind: string,
    @CurrentUser() user?: RequestUser,
  ) {
    return this.licenses.uploadPremiseFile({
      licenseId,
      kind,
      actor: actor(user),
      buffer: file?.buffer,
      mimeType: file?.mimetype,
      originalName: file?.originalname,
    });
  }

  @Delete('formation/premise-files/:id')
  removePremise(@Param('id') id: string, @CurrentUser() user?: RequestUser) {
    return this.licenses.removePremiseFile(id, actor(user));
  }

  @Get('formation/premise-files/:id/file')
  async premiseFile(@Param('id') id: string, @Res() res: Response) {
    sendFile(res, await this.licenses.readPremiseFile(id));
  }

  @Post('formation/submit')
  submit(@Body() dto: SaveRentalStepDto, @CurrentUser() user?: RequestUser) {
    return this.licenses.submitIntake(dto.licenseId, actor(user));
  }

  @Post('formation/step')
  step(@Body() dto: SaveRentalStepDto, @CurrentUser() user?: RequestUser) {
    return this.licenses.advanceStep(dto, actor(user));
  }

  @Post('formation/complete')
  complete(@Body() dto: SaveRentalStepDto, @CurrentUser() user?: RequestUser) {
    return this.licenses.complete(dto, actor(user));
  }

  @Get('formation/management-approvers')
  reviews(@Query('licenseId') licenseId = '') {
    if (!licenseId) throw new BadRequestException('مجوز مشخص نیست');
    return this.licenses.listReviews(licenseId);
  }

  @Post('formation/management-reviews/:id/decision')
  @UseInterceptors(upload)
  decide(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser | undefined,
    @UploadedFile() file: UploadFile | undefined,
    @Body('status') status = '',
    @Body('note') note?: string,
  ) {
    return this.licenses.decideReview(id, actor(user), {
      status,
      note,
      file: file?.buffer
        ? { buffer: file.buffer, mimeType: file.mimetype, originalName: file.originalname }
        : undefined,
    });
  }

  @Post('formation/management-reviews/:id/reopen')
  reopen(@Param('id') id: string, @CurrentUser() user?: RequestUser) {
    return this.licenses.reopenReview(id, actor(user));
  }

  @Get('formation/management-reviews/files/:fileId')
  async reviewFile(@Param('fileId') fileId: string, @Res() res: Response) {
    sendFile(res, await this.licenses.readReviewFile(fileId));
  }

  @Get('formation/issued')
  issued(@Query('licenseId') licenseId = '', @CurrentUser() user?: RequestUser) {
    if (!licenseId) throw new BadRequestException('مجوز مشخص نیست');
    return this.licenses.licenseDocument(licenseId, actor(user));
  }

  @Get(':id/license')
  license(@Param('id') id: string, @CurrentUser() user?: RequestUser) {
    return this.licenses.licenseDocument(id, actor(user));
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user?: RequestUser) {
    return this.licenses.getOne(id, actor(user));
  }

  @Post(':id/renewal')
  renew(@Param('id') id: string, @CurrentUser() user?: RequestUser) {
    return this.licenses.startRenewal(id, actor(user));
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user?: RequestUser) {
    return this.licenses.remove(id, actor(user));
  }
}

function sendFile(
  res: Response,
  file: { mimeType: string; byteSize: number; originalName: string | null; data: Buffer },
) {
  res.setHeader('Content-Type', file.mimeType);
  res.setHeader('Content-Length', String(file.byteSize));
  if (file.originalName) {
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(file.originalName)}"`);
  }
  res.send(file.data);
}
