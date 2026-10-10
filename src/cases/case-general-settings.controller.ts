import { Body, Controller, Get, Put } from '@nestjs/common';
import { CaseGeneralSettingsService } from './case-general-settings.service';
import { SaveCaseGeneralSettingsDto } from './dto/save-case-general-settings.dto';

@Controller('cases/settings/general')
export class CaseGeneralSettingsController {
  constructor(private readonly settings: CaseGeneralSettingsService) {}

  @Get()
  get() {
    return this.settings.get();
  }

  @Put()
  save(@Body() dto: SaveCaseGeneralSettingsDto) {
    return this.settings.save(dto);
  }
}
