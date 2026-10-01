import {
  BadRequestException,
  Body,
  Controller,
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
import { hasPermission } from '../access/access.util';
import { CaseInquiryChannel } from '../generated/prisma/client';
import { CasePlacesService } from './case-places.service';
import { type InquiryActor } from './case-inquiries.service';
import { FindCaseInquiriesQueryDto } from './dto/find-case-inquiries-query.dto';
import { SaveCasePlacesOfficeDto } from './dto/save-case-places-office.dto';

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

const placesFile = FileInterceptor('file', {
  storage: memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
});

@Controller('cases/settings/places-office')
export class CasePlacesOfficeController {
  constructor(private readonly places: CasePlacesService) {}

  @Get()
  office() {
    return this.places.office();
  }

  @Get('officers')
  officers() {
    return this.places.officerOptions();
  }

  @Put()
  save(@Body() dto: SaveCasePlacesOfficeDto) {
    return this.places.saveOffice(dto);
  }
}

@Controller('cases/places')
export class CasePlacesController {
  constructor(private readonly places: CasePlacesService) {}

  @Get()
  inbox(@CurrentUser() user: RequestUser | undefined, @Query() query: FindCaseInquiriesQueryDto) {
    return this.places.inbox(actorOf(user), query);
  }

  @Get('files/:fileId')
  async file(
    @Param('fileId') fileId: string,
    @CurrentUser() user: RequestUser | undefined,
    @Res() res: Response,
  ) {
    const file = await this.places.readFile(fileId, actorOf(user));
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Length', String(file.byteSize));
    if (file.originalName) {
      res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(file.originalName)}"`);
    }
    res.send(file.data);
  }

  @Get(':id/letter')
  letter(@Param('id') id: string, @CurrentUser() user: RequestUser | undefined) {
    return this.places.letter(id, actorOf(user));
  }

  @Get(':id/dossier')
  dossier(@Param('id') id: string, @CurrentUser() user: RequestUser | undefined) {
    return this.places.dossier(id, actorOf(user));
  }

  @Get(':id/documents/:versionId')
  async dossierFile(
    @Param('id') id: string,
    @Param('versionId') versionId: string,
    @CurrentUser() user: RequestUser | undefined,
    @Res() res: Response,
  ) {
    const file = await this.places.readDossierFile(id, versionId, actorOf(user));
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Length', String(file.byteSize));
    if (file.originalName) {
      res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(file.originalName)}"`);
    }
    res.send(file.data);
  }

  @Get(':id')
  detail(@Param('id') id: string, @CurrentUser() user: RequestUser | undefined) {
    return this.places.detail(id, actorOf(user));
  }

  @Post(':id/decision')
  @UseInterceptors(placesFile)
  async decide(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser | undefined,
    @UploadedFile() file: UploadFile | undefined,
    @Body('status') status = '',
    @Body('note') note?: string,
  ) {
    const saved = await this.places.decide(id, actorOf(user), {
      status,
      note,
      channel: CaseInquiryChannel.SYSTEM,
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
}
