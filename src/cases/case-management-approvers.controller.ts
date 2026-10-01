import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { CaseManagementApproversService } from './case-management-approvers.service';
import { CreateCaseManagementApproverDto } from './dto/create-case-management-approver.dto';
import { FindCaseManagementApproversQueryDto } from './dto/find-case-management-approvers-query.dto';

@Controller('cases/settings/management-approvers')
export class CaseManagementApproversController {
  constructor(private readonly approvers: CaseManagementApproversService) {}

  @Get()
  findAll(@Query() query: FindCaseManagementApproversQueryDto) {
    return this.approvers.findAll(query);
  }

  @Post()
  create(@Body() dto: CreateCaseManagementApproverDto) {
    return this.approvers.create(dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.approvers.remove(id);
  }
}
