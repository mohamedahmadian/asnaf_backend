import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import {
  CreateRentalIdentityDocumentDto,
  CreateRentalProcessRoleDto,
  FindRentalIdentityDocumentsQueryDto,
  SaveRentalDocumentsDto,
  SaveRentalLicenseSettingsDto,
} from './dto/save-rental-settings.dto';
import { RentalSettingsService } from './rental-settings.service';

@Controller('rental-licenses/settings')
export class RentalSettingsController {
  constructor(private readonly settings: RentalSettingsService) {}

  @Get('license')
  getLicense() {
    return this.settings.getLicenseSettings();
  }

  @Put('license')
  saveLicense(@Body() dto: SaveRentalLicenseSettingsDto) {
    return this.settings.saveLicenseSettings(dto);
  }

  @Get('identity-documents/options')
  identityOptions() {
    return this.settings.identityDocumentOptions();
  }

  @Get('identity-documents')
  identityDocuments(@Query() query: FindRentalIdentityDocumentsQueryDto) {
    return this.settings.findIdentityDocuments(query);
  }

  @Post('identity-documents')
  addIdentity(@Body() dto: CreateRentalIdentityDocumentDto) {
    return this.settings.addIdentityDocument(dto);
  }

  @Delete('identity-documents/:documentId')
  removeIdentity(@Param('documentId') documentId: string) {
    return this.settings.removeIdentityDocument(documentId);
  }

  @Get('documents')
  documents() {
    return this.settings.getDocuments();
  }

  @Put('documents')
  saveDocuments(@Body() dto: SaveRentalDocumentsDto) {
    return this.settings.saveDocuments(dto);
  }

  @Get('process-management-roles')
  processRoles() {
    return this.settings.listProcessRoles();
  }

  @Post('process-management-roles')
  addProcessRole(@Body() dto: CreateRentalProcessRoleDto) {
    return this.settings.addProcessRole(dto);
  }

  @Delete('process-management-roles/:id')
  removeProcessRole(@Param('id') id: string) {
    return this.settings.removeProcessRole(id);
  }
}
