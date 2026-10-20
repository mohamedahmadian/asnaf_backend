import { Module } from '@nestjs/common';
import { CaseGeneralSettingsController } from './case-general-settings.controller';
import { CaseGeneralSettingsService } from './case-general-settings.service';
import { CaseActivityLicenseSettingsController } from './case-activity-license-settings.controller';
import { CaseActivityLicenseSettingsService } from './case-activity-license-settings.service';
import { CaseLetterheadController } from './case-letterhead.controller';
import { CaseLetterheadService } from './case-letterhead.service';
import { CaseRequirementsController } from './case-requirements.controller';
import { CaseRequirementsService } from './case-requirements.service';
import { CaseIdentityDocumentsController } from './case-identity-documents.controller';
import { CaseIdentityDocumentsService } from './case-identity-documents.service';
import { CaseManagementApproversController } from './case-management-approvers.controller';
import { CaseIssuanceController } from './case-issuance.controller';
import { CaseManagementReviewsController } from './case-management-reviews.controller';
import { CaseManagementReviewsReportService } from './case-management-reviews-report.service';
import { CaseManagementApproversService } from './case-management-approvers.service';
import { CaseProcessManagementRolesController } from './case-process-management-roles.controller';
import { CaseProcessManagementRolesService } from './case-process-management-roles.service';
import { CaseRevocationSettingsController } from './case-revocation-settings.controller';
import { CaseRevocationSettingsService } from './case-revocation-settings.service';
import { CaseRevocationProcessController } from './case-revocation-process.controller';
import { CaseRevocationProcessService } from './case-revocation-process.service';
import { DashboardController } from './dashboard.controller';
import { CaseInquiriesController } from './case-inquiries.controller';
import { CaseInquiriesReportService } from './case-inquiries-report.service';
import { CaseInquiriesService } from './case-inquiries.service';
import { CasePlacesController, CasePlacesOfficeController } from './case-places.controller';
import { CasePlacesReportService } from './case-places-report.service';
import { CasePlacesService } from './case-places.service';
import { CaseAuctionService } from './case-auction.service';
import { CaseExpiryController } from './case-expiry.controller';
import { CaseExpiryService } from './case-expiry.service';
import { CaseStewardshipService } from './case-stewardship.service';
import { CaseRecordsController } from './case-records.controller';
import { CaseReportsController } from './case-reports.controller';
import { ExpiringCasesService } from './expiring-cases.service';
import { CaseStatusService } from './case-status.service';
import { CasesController } from './cases.controller';
import { CasesService } from './cases.service';
import { PersonFileStorage } from './person-file.storage';

@Module({
  controllers: [
    CasesController,
    CaseInquiriesController,
    CasePlacesController,
    CasePlacesOfficeController,
    CaseManagementReviewsController,
    CaseIssuanceController,
    CaseRecordsController,
    CaseReportsController,
    CaseExpiryController,
    CaseIdentityDocumentsController,
    CaseGeneralSettingsController,
    CaseLetterheadController,
    CaseActivityLicenseSettingsController,
    CaseRequirementsController,
    CaseManagementApproversController,
    CaseProcessManagementRolesController,
    CaseRevocationSettingsController,
    CaseRevocationProcessController,
    DashboardController,
  ],
  exports: [CasesService, CaseStatusService],
  providers: [
    CasesService,
    CaseStatusService,
    ExpiringCasesService,
    CaseExpiryService,
    CaseAuctionService,
    CaseStewardshipService,
    CaseInquiriesService,
    CaseInquiriesReportService,
    CasePlacesService,
    CasePlacesReportService,
    CaseIdentityDocumentsService,
    CaseGeneralSettingsService,
    CaseLetterheadService,
    CaseActivityLicenseSettingsService,
    CaseRequirementsService,
    CaseManagementApproversService,
    CaseManagementReviewsReportService,
    CaseProcessManagementRolesService,
    CaseRevocationSettingsService,
    CaseRevocationProcessService,
    PersonFileStorage,
  ],
})
export class CasesModule {}
