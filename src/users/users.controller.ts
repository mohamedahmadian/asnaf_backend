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
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CasesService } from '../cases/cases.service';
import { CheckIdentityDto } from './dto/check-identity.dto';
import { CheckRegisterDto } from './dto/check-register.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { RegisterUserDto } from './dto/register-user.dto';
import { FindLocationHistoryQueryDto } from './dto/find-location-history-query.dto';
import { FindUsersQueryDto } from './dto/find-users-query.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateUserLocationDto } from './dto/update-user-location.dto';
import {
  identityDocumentFile,
  requireIdentityUpload,
  sendIdentityDocumentFile,
  type IdentityUploadFile,
} from './identity-document-http';
import { UsersService } from './users.service';

type RequestUser = { id: string };

@Controller('users')
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly cases: CasesService,
  ) {}

  @Get()
  findAll(@Query() query: FindUsersQueryDto) {
    return this.users.findAll(query);
  }

  @Post('identity-check')
  checkIdentity(@Body() dto: CheckIdentityDto) {
    return this.users.checkIdentityTaken(dto);
  }

  @Post('register-check')
  checkRegister(@Body() dto: CheckRegisterDto) {
    return this.users.checkRegister(dto);
  }

  @Post('register')
  register(@Body() dto: RegisterUserDto) {
    return this.users.register(dto);
  }

  @Get(':id/identity-documents')
  identityDocuments(@Param('id') id: string) {
    return this.cases.identityDocumentBundle(id);
  }

  @Post(':id/identity-documents')
  @UseInterceptors(identityDocumentFile)
  uploadIdentityDocument(
    @Param('id') id: string,
    @UploadedFile() file: IdentityUploadFile | undefined,
    @Body('documentId') documentId = '',
    @CurrentUser() user?: RequestUser,
  ) {
    const upload = requireIdentityUpload(file, user?.id);
    return this.cases.uploadDocument({
      userId: id,
      documentId: documentId.trim(),
      actorId: upload.actorId,
      buffer: upload.file.buffer,
      mimeType: upload.file.mimetype,
      originalName: upload.file.originalname,
    });
  }

  @Delete(':id/identity-documents/:documentId')
  removeIdentityDocument(
    @Param('id') id: string,
    @Param('documentId') documentId: string,
    @CurrentUser() user?: RequestUser,
  ) {
    return this.cases.removeDocument(id, documentId, { actorId: user?.id });
  }

  @Get(':id/identity-documents/:versionId/file')
  async identityDocumentFile(
    @Param('id') id: string,
    @Param('versionId') versionId: string,
    @Res() res: Response,
  ) {
    const file = await this.cases.readPersonDocumentFile(id, versionId);
    sendIdentityDocumentFile(res, file);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.users.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateUserDto) {
    return this.users.create(dto);
  }

  @Get(':id/location-history')
  locationHistory(
    @Param('id') id: string,
    @Query() query: FindLocationHistoryQueryDto,
  ) {
    return this.users.findLocationHistory(id, query);
  }

  @Patch(':id/location')
  updateLocation(@Param('id') id: string, @Body() dto: UpdateUserLocationDto) {
    return this.users.updateLocation(id, dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.users.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.users.remove(id);
  }
}
