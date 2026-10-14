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
import type { Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CasesService } from '../cases/cases.service';
import { FindLocationHistoryQueryDto } from './dto/find-location-history-query.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { CheckIdentityDto } from './dto/check-identity.dto';
import { UpdateUserLocationDto } from './dto/update-user-location.dto';
import {
  identityDocumentFile,
  requireIdentityUpload,
  sendIdentityDocumentFile,
  type IdentityUploadFile,
} from './identity-document-http';
import { UsersService } from './users.service';

type RequestUser = { id: string };

@Controller('account')
export class AccountController {
  constructor(
    private readonly users: UsersService,
    private readonly cases: CasesService,
  ) {}

  private requireUser(user?: RequestUser) {
    if (!user?.id) {
      throw new UnauthorizedException();
    }
    return user;
  }

  @Get('identity-documents')
  identityDocuments(@CurrentUser() user: RequestUser | undefined) {
    return this.cases.identityDocumentBundle(this.requireUser(user).id);
  }

  @Post('identity-documents')
  @UseInterceptors(identityDocumentFile)
  uploadIdentityDocument(
    @CurrentUser() user: RequestUser | undefined,
    @UploadedFile() file: IdentityUploadFile | undefined,
    @Body('documentId') documentId = '',
  ) {
    const actor = this.requireUser(user);
    const upload = requireIdentityUpload(file, actor.id);
    return this.cases.uploadDocument({
      userId: actor.id,
      documentId: documentId.trim(),
      actorId: upload.actorId,
      buffer: upload.file.buffer,
      mimeType: upload.file.mimetype,
      originalName: upload.file.originalname,
    });
  }

  @Delete('identity-documents/:documentId')
  removeIdentityDocument(
    @CurrentUser() user: RequestUser | undefined,
    @Param('documentId') documentId: string,
  ) {
    const actor = this.requireUser(user);
    return this.cases.removeDocument(actor.id, documentId, { actorId: actor.id });
  }

  @Get('identity-documents/:versionId/file')
  async identityDocumentFile(
    @CurrentUser() user: RequestUser | undefined,
    @Param('versionId') versionId: string,
    @Res() res: Response,
  ) {
    const file = await this.cases.readPersonDocumentFile(this.requireUser(user).id, versionId);
    sendIdentityDocumentFile(res, file);
  }

  @Get()
  me(@CurrentUser() user: RequestUser | undefined) {
    return this.users.findOne(this.requireUser(user).id);
  }

  @Post('identity-check')
  checkIdentity(
    @CurrentUser() user: RequestUser | undefined,
    @Body() dto: CheckIdentityDto,
  ) {
    return this.users.checkIdentityTaken({
      ...dto,
      excludeId: this.requireUser(user).id,
    });
  }

  @Get('location-history')
  locationHistory(
    @CurrentUser() user: RequestUser | undefined,
    @Query() query: FindLocationHistoryQueryDto,
  ) {
    return this.users.findLocationHistory(this.requireUser(user).id, query);
  }

  @Delete('location-history/:id')
  removeLocationHistory(
    @CurrentUser() user: RequestUser | undefined,
    @Param('id') id: string,
  ) {
    return this.users.removeLocationHistory(this.requireUser(user).id, id);
  }

  @Delete('location-history')
  removeAllLocationHistory(@CurrentUser() user: RequestUser | undefined) {
    return this.users.removeAllLocationHistory(this.requireUser(user).id);
  }

  @Patch('location')
  updateLocation(
    @CurrentUser() user: RequestUser | undefined,
    @Body() dto: UpdateUserLocationDto,
  ) {
    return this.users.updateLocation(this.requireUser(user).id, dto);
  }

  @Patch()
  update(
    @CurrentUser() user: RequestUser | undefined,
    @Body() dto: UpdateUserDto,
  ) {
    return this.users.updateOwnAccount(this.requireUser(user).id, dto);
  }
}
