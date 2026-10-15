import { Body, Controller, Get, Put } from '@nestjs/common';
import { CaseRevocationSettingsService } from './case-revocation-settings.service';
import { SaveCaseRevocationSettingsDto } from './dto/save-case-revocation-settings.dto';

@Controller('cases/settings/revocation')
export class CaseRevocationSettingsController {
  constructor(private readonly settings: CaseRevocationSettingsService) {}

  @Get()
  get() {
    return this.settings.get();
  }

  @Put()
  save(@Body() dto: SaveCaseRevocationSettingsDto) {
    return this.settings.save(dto);
  }
}
