import { Module } from '@nestjs/common';
import { CaseIdentityDocumentsController } from './case-identity-documents.controller';
import { CaseIdentityDocumentsService } from './case-identity-documents.service';
import { DashboardController } from './dashboard.controller';
import { CaseInquiriesController } from './case-inquiries.controller';
import { CaseInquiriesService } from './case-inquiries.service';
import { CaseRecordsController } from './case-records.controller';
import { CasesController } from './cases.controller';
import { CasesService } from './cases.service';
import { PersonFileStorage } from './person-file.storage';

@Module({
  controllers: [
    CasesController,
    CaseInquiriesController,
    CaseRecordsController,
    CaseIdentityDocumentsController,
    DashboardController,
  ],
  providers: [CasesService, CaseInquiriesService, CaseIdentityDocumentsService, PersonFileStorage],
})
export class CasesModule {}
