import { Module } from '@nestjs/common';
import { CaseIdentityDocumentsController } from './case-identity-documents.controller';
import { CaseIdentityDocumentsService } from './case-identity-documents.service';
import { CaseManagementApproversController } from './case-management-approvers.controller';
import { CaseManagementApproversService } from './case-management-approvers.service';
import { DashboardController } from './dashboard.controller';
import { CaseInquiriesController } from './case-inquiries.controller';
import { CaseInquiriesService } from './case-inquiries.service';
import { CasePlacesController, CasePlacesOfficeController } from './case-places.controller';
import { CasePlacesService } from './case-places.service';
import { CaseRecordsController } from './case-records.controller';
import { CasesController } from './cases.controller';
import { CasesService } from './cases.service';
import { PersonFileStorage } from './person-file.storage';

@Module({
  controllers: [
    CasesController,
    CaseInquiriesController,
    CasePlacesController,
    CasePlacesOfficeController,
    CaseRecordsController,
    CaseIdentityDocumentsController,
    CaseManagementApproversController,
    DashboardController,
  ],
  providers: [
    CasesService,
    CaseInquiriesService,
    CasePlacesService,
    CaseIdentityDocumentsService,
    CaseManagementApproversService,
    PersonFileStorage,
  ],
})
export class CasesModule {}
