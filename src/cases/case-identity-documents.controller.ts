import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { CaseIdentityDocumentsService } from './case-identity-documents.service';
import { CreateCaseIdentityDocumentDto } from './dto/create-case-identity-document.dto';
import { FindCaseIdentityDocumentsQueryDto } from './dto/find-case-identity-documents-query.dto';

@Controller('cases/settings/identity-documents')
export class CaseIdentityDocumentsController {
  constructor(private readonly documents: CaseIdentityDocumentsService) {}

  @Get()
  findAll(@Query() query: FindCaseIdentityDocumentsQueryDto) {
    return this.documents.findAll(query);
  }

  @Get('options')
  options() {
    return this.documents.options();
  }

  @Post()
  create(@Body() dto: CreateCaseIdentityDocumentDto) {
    return this.documents.create(dto);
  }

  @Delete(':documentId')
  remove(@Param('documentId') documentId: string) {
    return this.documents.remove(documentId);
  }
}
