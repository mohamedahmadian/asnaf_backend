import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  containsInsensitive,
  paginatedResult,
  paginationArgs,
} from '../common/pagination';
import { resolveSortOrder } from '../common/sort-query';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCaseManagementApproverDto } from './dto/create-case-management-approver.dto';
import { FindCaseManagementApproversQueryDto } from './dto/find-case-management-approvers-query.dto';

@Injectable()
export class CaseManagementApproversService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: FindCaseManagementApproversQueryDto) {
    const where: Prisma.CaseManagementApproverWhereInput = query.q
      ? {
          OR: [
            { workUnit: { title: containsInsensitive(query.q) } },
            { role: { name: containsInsensitive(query.q) } },
          ],
        }
      : {};
    const orderBy = resolveSortOrder<Prisma.CaseManagementApproverOrderByWithRelationInput>(
      query.sortBy,
      query.sortDir,
      {
        unit: (dir) => ({ workUnit: { title: dir } }),
        role: (dir) => ({ role: { name: dir } }),
      },
      [{ createdAt: 'desc' }, { id: 'asc' }],
    );
    const { page, pageSize, skip, take } = paginationArgs(query);
    const [rows, total] = await Promise.all([
      this.prisma.caseManagementApprover.findMany({
        where,
        orderBy,
        skip,
        take,
        select: {
          id: true,
          workUnitId: true,
          roleId: true,
          createdAt: true,
          workUnit: { select: { title: true } },
          role: { select: { name: true } },
        },
      }),
      this.prisma.caseManagementApprover.count({ where }),
    ]);
    return paginatedResult(
      rows.map((row) => ({
        id: row.id,
        workUnitId: row.workUnitId,
        workUnitTitle: row.workUnit.title,
        roleId: row.roleId,
        roleName: row.role.name,
        createdAt: row.createdAt,
      })),
      total,
      page,
      pageSize,
    );
  }

  async create(dto: CreateCaseManagementApproverDto) {
    const [unit, role] = await Promise.all([
      this.prisma.workUnit.findUnique({
        where: { id: dto.workUnitId },
        select: { id: true },
      }),
      this.prisma.role.findUnique({
        where: { id: dto.roleId },
        select: { id: true },
      }),
    ]);
    if (!unit) {
      throw new NotFoundException('واحد سازمانی یافت نشد');
    }
    if (!role) {
      throw new NotFoundException('نقش یافت نشد');
    }
    try {
      await this.prisma.caseManagementApprover.create({
        data: { workUnitId: dto.workUnitId, roleId: dto.roleId },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('این واحد و نقش قبلاً به فهرست اضافه شده است');
      }
      throw error;
    }
    return { ok: true };
  }

  async remove(id: string) {
    try {
      await this.prisma.caseManagementApprover.delete({ where: { id } });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException('این مورد در فهرست نیست');
      }
      throw error;
    }
    return { ok: true };
  }
}
