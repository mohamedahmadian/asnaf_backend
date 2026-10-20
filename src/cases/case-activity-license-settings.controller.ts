import { Body, Controller, Get, Put } from '@nestjs/common';
import { CaseActivityLicenseSettingsService } from './case-activity-license-settings.service';
import { SaveCaseActivityLicenseSettingsDto } from './dto/save-case-activity-license-settings.dto';

@Controller('cases/settings/activity-license')
export class CaseActivityLicenseSettingsController {
  constructor(private readonly settings: CaseActivityLicenseSettingsService) {}

  @Get()
  get() {
    return this.settings.get();
  }

  @Put()
  save(@Body() dto: SaveCaseActivityLicenseSettingsDto) {
    return this.settings.save(dto);
  }
}
