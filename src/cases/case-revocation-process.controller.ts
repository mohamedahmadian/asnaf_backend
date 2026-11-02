import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CaseRevocationProcessService } from './case-revocation-process.service';
import {
  CompleteCaseRevocationDto,
  SaveCaseRevocationAmountDto,
} from './dto/case-revocation-process.dto';

type RequestUser = {
  id: string;
};

type UploadFile = {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
};

const processFile = FileInterceptor('file', {
  storage: memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
});

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

  @Post('files')
  @UseInterceptors(processFile)
  addFile(
    @Param('caseId') caseFileId: string,
    @UploadedFile() file: UploadFile | undefined,
    @CurrentUser() user: RequestUser | undefined,
  ) {
    if (!file?.buffer?.length) {
      return this.process.state(caseFileId);
    }
    return this.process.addProcessFile(
      caseFileId,
      { buffer: file.buffer, mimeType: file.mimetype, originalName: file.originalname },
      user?.id,
    );
  }

  @Delete('files/:fileId')
  removeFile(
    @Param('caseId') caseFileId: string,
    @Param('fileId') fileId: string,
  ) {
    return this.process.removeProcessFile(caseFileId, fileId);
  }

  @Get('files/:fileId')
  async readProcessFile(
    @Param('caseId') caseFileId: string,
    @Param('fileId') fileId: string,
    @Res() res: Response,
  ) {
    const file = await this.process.readProcessFile(caseFileId, fileId);
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Length', String(file.byteSize));
    if (file.originalName) {
      res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(file.originalName)}"`);
    }
    res.send(file.data);
  }

  @Get('request-files/:fileId')
  async readRequestFile(
    @Param('caseId') caseFileId: string,
    @Param('fileId') fileId: string,
    @Res() res: Response,
  ) {
    const file = await this.process.readRequestFile(caseFileId, fileId);
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Length', String(file.byteSize));
    if (file.originalName) {
      res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(file.originalName)}"`);
    }
    res.send(file.data);
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
