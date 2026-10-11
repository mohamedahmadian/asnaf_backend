import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { CaseProcessManagementRolesService } from './case-process-management-roles.service';
import { CreateCaseProcessManagementRoleDto } from './dto/create-case-process-management-role.dto';

@Controller('cases/settings/process-management-roles')
export class CaseProcessManagementRolesController {
  constructor(private readonly roles: CaseProcessManagementRolesService) {}

  @Get()
  list(@Query('requestType') requestType = '') {
    return this.roles.list(requestType);
  }

  @Post()
  create(@Body() dto: CreateCaseProcessManagementRoleDto) {
    return this.roles.create(dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.roles.remove(id);
  }
}
