import { Module } from '@nestjs/common';
import { CaseGeneralSettingsController } from './case-general-settings.controller';
import { CaseGeneralSettingsService } from './case-general-settings.service';
import { CaseRequirementsController } from './case-requirements.controller';
import { CaseRequirementsService } from './case-requirements.service';
import { CaseIdentityDocumentsController } from './case-identity-documents.controller';
import { CaseIdentityDocumentsService } from './case-identity-documents.service';
import { CaseManagementApproversController } from './case-management-approvers.controller';
import { CaseManagementApproversService } from './case-management-approvers.service';
import { CaseProcessManagementRolesController } from './case-process-management-roles.controller';
import { CaseProcessManagementRolesService } from './case-process-management-roles.service';
import { DashboardController } from './dashboard.controller';
import { CaseInquiriesController } from './case-inquiries.controller';
import { CaseInquiriesService } from './case-inquiries.service';
import { CasePlacesController, CasePlacesOfficeController } from './case-places.controller';
import { CasePlacesService } from './case-places.service';
import { CaseAuctionService } from './case-auction.service';
import { CaseStewardshipService } from './case-stewardship.service';
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
    CaseGeneralSettingsController,
    CaseRequirementsController,
    CaseManagementApproversController,
    CaseProcessManagementRolesController,
    DashboardController,
  ],
  providers: [
    CasesService,
    CaseAuctionService,
    CaseStewardshipService,
    CaseInquiriesService,
    CasePlacesService,
    CaseIdentityDocumentsService,
    CaseGeneralSettingsService,
    CaseRequirementsService,
    CaseManagementApproversService,
    CaseProcessManagementRolesService,
    PersonFileStorage,
  ],
})
export class CasesModule {}
