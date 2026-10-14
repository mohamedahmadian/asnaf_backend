import { Body, Controller, Get, Put } from '@nestjs/common';
import { CaseLetterheadService } from './case-letterhead.service';
import { SaveCaseLetterheadDto } from './dto/save-case-letterhead.dto';

@Controller('cases/settings/letterhead')
export class CaseLetterheadController {
  constructor(private readonly letterhead: CaseLetterheadService) {}

  @Get()
  get() {
    return this.letterhead.get();
  }

  @Put()
  save(@Body() dto: SaveCaseLetterheadDto) {
    return this.letterhead.save(dto);
  }
}
