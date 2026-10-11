import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CaseRequestType, Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCaseProcessManagementRoleDto } from './dto/create-case-process-management-role.dto';
import { isSettingsRequestType } from './request-process';

@Injectable()
export class CaseProcessManagementRolesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(requestType: string) {
    if (!isSettingsRequestType(requestType)) {
      throw new BadRequestException('نوع درخواست معتبر نیست');
    }
    const rows = await this.prisma.caseProcessManagementRole.findMany({
      where: { requestType },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        roleId: true,
        title: true,
        role: { select: { name: true } },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      roleId: row.roleId,
      roleName: row.role.name,
      title: row.title,
    }));
  }

  async create(dto: CreateCaseProcessManagementRoleDto) {
    const title = dto.title.trim();
    if (!title) throw new BadRequestException('عنوان را وارد کنید');
    const role = await this.prisma.role.findUnique({
      where: { id: dto.roleId },
      select: { id: true },
    });
    if (!role) throw new NotFoundException('نقش یافت نشد');
    try {
      await this.prisma.caseProcessManagementRole.create({
        data: {
          requestType: dto.requestType as CaseRequestType,
          roleId: dto.roleId,
          title,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('این نقش قبلاً برای این فرایند ثبت شده است');
      }
      throw error;
    }
    return { ok: true };
  }

  async remove(id: string) {
    try {
      await this.prisma.caseProcessManagementRole.delete({ where: { id } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new NotFoundException('این مورد در فهرست نیست');
      }
      throw error;
    }
    return { ok: true };
  }
}
