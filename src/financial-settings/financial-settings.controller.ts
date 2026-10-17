import { BadRequestException, Body, Controller, Get, Param, Put } from '@nestjs/common';
import { CaseRequestType } from '../generated/prisma/client';
import { SaveFinancialRequestSettingDto } from './dto/save-financial-request-setting.dto';
import {
  FinancialSettingsService,
  financialRequestTypes,
  type FinancialRequestType,
} from './financial-settings.service';

@Controller('financial-settings')
export class FinancialSettingsController {
  constructor(private readonly settings: FinancialSettingsService) {}

  @Get()
  get() {
    return this.settings.get();
  }

  @Put(':requestType')
  save(
    @Param('requestType') requestType: CaseRequestType,
    @Body() dto: SaveFinancialRequestSettingDto,
  ) {
    if (!financialRequestTypes.includes(requestType as FinancialRequestType)) {
      throw new BadRequestException('نوع درخواست مالی معتبر نیست');
    }
    return this.settings.save(requestType as FinancialRequestType, dto);
  }
}
