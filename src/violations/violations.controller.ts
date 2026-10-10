import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  UnauthorizedException,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CreateProceedingDto } from './dto/create-proceeding.dto';
import { CreateViolationDto } from './dto/create-violation.dto';
import { FindProceedingsQueryDto } from './dto/find-proceedings-query.dto';
import { FindViolationPersonQueryDto } from './dto/find-violation-person-query.dto';
import { FindViolationsQueryDto } from './dto/find-violations-query.dto';
import { UpdateProceedingDto } from './dto/update-proceeding.dto';
import { UpdateViolationDto } from './dto/update-violation.dto';
import { ViolationReportQueryDto } from './dto/violation-report-query.dto';
import type { UploadFile } from './stored-uploads';
import { ViolationsService } from './violations.service';

const fileUpload = FilesInterceptor('files', 12, {
  storage: memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
});

type RequestUser = { id: string };

@Controller('violations')
export class ViolationsController {
  constructor(private readonly violations: ViolationsService) {}

  @Get('report')
  report(@Query() query: ViolationReportQueryDto) {
    return this.violations.report(query);
  }

  @Get('person')
  person(@Query() query: FindViolationPersonQueryDto) {
    return this.violations.findPerson(query.nationalId);
  }

  @Get('by-case/:caseFileId')
  findByCase(@Param('caseFileId', ParseUUIDPipe) caseFileId: string) {
    return this.violations.findByCase(caseFileId);
  }

  @Get()
  findAll(@Query() query: FindViolationsQueryDto) {
    return this.violations.findAll(query);
  }

  @Post()
  @UseInterceptors(fileUpload)
  create(
    @Body() dto: CreateViolationDto,
    @UploadedFiles() files: UploadFile[] | undefined,
    @CurrentUser() user: RequestUser | undefined,
  ) {
    return this.violations.create(dto, this.userId(user), files);
  }

  @Get(':id/proceedings')
  findProceedings(
    @Param('id') id: string,
    @Query() query: FindProceedingsQueryDto,
  ) {
    return this.violations.findProceedings(id, query);
  }

  @Post(':id/proceedings')
  @UseInterceptors(fileUpload)
  createProceeding(
    @Param('id') id: string,
    @Body() dto: CreateProceedingDto,
    @UploadedFiles() files: UploadFile[] | undefined,
    @CurrentUser() user: RequestUser | undefined,
  ) {
    return this.violations.createProceeding(id, dto, this.userId(user), files);
  }

  @Get(':id/proceedings/:proceedingId/attachments/:attachmentId')
  async proceedingAttachment(
    @Param('id') id: string,
    @Param('proceedingId') proceedingId: string,
    @Param('attachmentId') attachmentId: string,
    @Res() res: Response,
  ) {
    const file = await this.violations.readProceedingAttachment(
      id,
      proceedingId,
      attachmentId,
    );
    this.sendFile(res, file);
  }

  @Get(':id/proceedings/:proceedingId')
  findProceeding(
    @Param('id') id: string,
    @Param('proceedingId') proceedingId: string,
  ) {
    return this.violations.findProceeding(id, proceedingId);
  }

  @Patch(':id/proceedings/:proceedingId')
  @UseInterceptors(fileUpload)
  updateProceeding(
    @Param('id') id: string,
    @Param('proceedingId') proceedingId: string,
    @Body() dto: UpdateProceedingDto,
    @UploadedFiles() files: UploadFile[] | undefined,
  ) {
    return this.violations.updateProceeding(id, proceedingId, dto, files);
  }

  @Delete(':id/proceedings/:proceedingId')
  removeProceeding(
    @Param('id') id: string,
    @Param('proceedingId') proceedingId: string,
  ) {
    return this.violations.removeProceeding(id, proceedingId);
  }

  @Get(':id/attachments/:attachmentId')
  async attachment(
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
    @Res() res: Response,
  ) {
    const file = await this.violations.readViolationAttachment(id, attachmentId);
    this.sendFile(res, file);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.violations.findOne(id);
  }

  @Patch(':id')
  @UseInterceptors(fileUpload)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateViolationDto,
    @UploadedFiles() files: UploadFile[] | undefined,
  ) {
    return this.violations.update(id, dto, files);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.violations.remove(id);
  }

  private userId(user: RequestUser | undefined) {
    if (!user?.id) throw new UnauthorizedException();
    return user.id;
  }

  private sendFile(
    res: Response,
    file: { mimeType: string; data: Buffer; name: string },
  ) {
    const ascii = file.name.replace(/[^\w.\-]+/g, '_') || 'file';
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(file.name)}`,
    );
    res.send(file.data);
  }
}
