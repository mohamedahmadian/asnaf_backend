import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import {
  ensureJobGroupRepRole,
  JOB_GROUP_REP_ROLE_CODE,
} from '../access/access.constants';
import {
  containsInsensitive,
  normalizeSearchDigits,
  paginatedResult,
  paginationArgs,
  wantsPagination,
} from '../common/pagination';
import { isValidIranianNationalId, toLatinDigits } from '../common/national-id';
import { resolveSortOrder } from '../common/sort-query';
import { Prisma, UserStatus } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { joinFullName } from '../users/user-profile.util';
import { CreateJobGroupRepresentativeDto } from './dto/create-job-group-representative.dto';
import { FindJobGroupRepresentativesQueryDto } from './dto/find-job-group-representatives-query.dto';

const repSelect = {
  createdAt: true,
  user: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      fullName: true,
      nationalId: true,
      phone: true,
    },
  },
} satisfies Prisma.JobGroupRepresentativeSelect;

function mapRepresentative(row: {
  createdAt: Date;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    fullName: string;
    nationalId: string | null;
    phone: string | null;
  };
}) {
  return {
    id: row.user.id,
    firstName: row.user.firstName,
    lastName: row.user.lastName,
    fullName: row.user.fullName,
    nationalId: row.user.nationalId,
    phone: row.user.phone,
    createdAt: row.createdAt,
  };
}

@Injectable()
export class JobGroupRepresentativesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(jobGroupId: string, query: FindJobGroupRepresentativesQueryDto) {
    await this.assertGroup(jobGroupId);
    const where = this.where(jobGroupId, query.q);
    const orderBy = resolveSortOrder<Prisma.JobGroupRepresentativeOrderByWithRelationInput>(
      query.sortBy,
      query.sortDir,
      {
        fullName: (dir) => ({ user: { fullName: dir } }),
        nationalId: (dir) => ({ user: { nationalId: dir } }),
        phone: (dir) => ({ user: { phone: dir } }),
        createdAt: (dir) => ({ createdAt: dir }),
      },
      [{ createdAt: 'desc' }, { userId: 'asc' }],
    );
    if (!wantsPagination(query)) {
      const items = await this.prisma.jobGroupRepresentative.findMany({
        where,
        orderBy,
        select: repSelect,
      });
      return items.map(mapRepresentative);
    }
    const { page, pageSize, skip, take } = paginationArgs(query);
    const [items, total] = await Promise.all([
      this.prisma.jobGroupRepresentative.findMany({
        where,
        orderBy,
        skip,
        take,
        select: repSelect,
      }),
      this.prisma.jobGroupRepresentative.count({ where }),
    ]);
    return paginatedResult(items.map(mapRepresentative), total, page, pageSize);
  }

  async create(jobGroupId: string, dto: CreateJobGroupRepresentativeDto) {
    await this.assertGroup(jobGroupId);
    if (!isValidIranianNationalId(dto.nationalId)) {
      throw new BadRequestException('کد ملی معتبر نیست');
    }
    if (!/^09\d{9}$/.test(dto.phone)) {
      throw new BadRequestException('شماره همراه معتبر نیست');
    }

    const [byNationalId, byPhone, byUsername] = await Promise.all([
      this.prisma.user.findUnique({
        where: { nationalId: dto.nationalId },
        select: { id: true },
      }),
      this.prisma.user.findUnique({
        where: { phone: dto.phone },
        select: { id: true },
      }),
      this.prisma.user.findUnique({
        where: { username: dto.nationalId },
        select: { id: true },
      }),
    ]);
    if (byNationalId || byUsername) {
      throw new ConflictException('این کد ملی قبلاً ثبت شده است');
    }
    if (byPhone) {
      throw new ConflictException('این تلفن همراه قبلاً ثبت شده است');
    }

    const role = await ensureJobGroupRepRole(this.prisma);
    const passwordHash = await bcrypt.hash(toLatinDigits(dto.password), 10);
    try {
      const row = await this.prisma.jobGroupRepresentative.create({
        data: {
          jobGroup: { connect: { id: jobGroupId } },
          user: {
            create: {
              username: dto.nationalId,
              passwordHash,
              firstName: dto.firstName,
              lastName: dto.lastName,
              fullName: joinFullName(dto.firstName, dto.lastName),
              nationalId: dto.nationalId,
              phone: dto.phone,
              status: UserStatus.ACTIVE,
              locale: 'fa',
              userRoles: { create: { roleId: role.id } },
            },
          },
        },
        select: repSelect,
      });
      return mapRepresentative(row);
    } catch (error) {
      this.rethrowUnique(error);
    }
  }

  async remove(jobGroupId: string, userId: string) {
    await this.assertGroup(jobGroupId);
    const link = await this.prisma.jobGroupRepresentative.findUnique({
      where: { jobGroupId_userId: { jobGroupId, userId } },
      select: { userId: true },
    });
    if (!link) {
      throw new NotFoundException('نماینده این گروه یافت نشد');
    }

    const otherGroups = await this.prisma.jobGroupRepresentative.count({
      where: { userId, jobGroupId: { not: jobGroupId } },
    });
    const linkWhere = { jobGroupId_userId: { jobGroupId, userId } };
    if (otherGroups > 0) {
      await this.prisma.jobGroupRepresentative.delete({ where: linkWhere });
      return { ok: true };
    }

    const roles = await this.prisma.userRole.findMany({
      where: { userId },
      select: { role: { select: { code: true } } },
    });
    const onlyRepresentative =
      roles.length > 0 &&
      roles.every((item) => item.role.code === JOB_GROUP_REP_ROLE_CODE);

    if (!onlyRepresentative) {
      await this.prisma.$transaction([
        this.prisma.jobGroupRepresentative.delete({ where: linkWhere }),
        this.prisma.userRole.deleteMany({
          where: { userId, role: { code: JOB_GROUP_REP_ROLE_CODE } },
        }),
      ]);
      return { ok: true };
    }

    try {
      await this.prisma.$transaction([
        this.prisma.jobGroupRepresentative.delete({ where: linkWhere }),
        this.prisma.user.delete({ where: { id: userId } }),
      ]);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === 'P2003' || error.code === 'P2014')
      ) {
        await this.prisma.$transaction([
          this.prisma.jobGroupRepresentative.delete({ where: linkWhere }),
          this.prisma.userRole.deleteMany({
            where: { userId, role: { code: JOB_GROUP_REP_ROLE_CODE } },
          }),
        ]);
        return { ok: true };
      }
      throw error;
    }
    return { ok: true };
  }

  private async assertGroup(id: string) {
    const item = await this.prisma.jobGroup.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!item) {
      throw new NotFoundException('گروه شغلی یافت نشد');
    }
  }

  private where(jobGroupId: string, q?: string): Prisma.JobGroupRepresentativeWhereInput {
    const term = q?.trim();
    if (!term) {
      return { jobGroupId };
    }
    const digits = normalizeSearchDigits(term);
    const or: Prisma.UserWhereInput[] = [
      { fullName: containsInsensitive(term) },
      { firstName: containsInsensitive(term) },
      { lastName: containsInsensitive(term) },
    ];
    if (digits) {
      or.push({ nationalId: { contains: digits } }, { phone: { contains: digits } });
    }
    return { jobGroupId, user: { OR: or } };
  }

  private rethrowUnique(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      const target = error.meta?.target;
      const fields = Array.isArray(target) ? target.join(' ') : String(target ?? '');
      if (fields.includes('phone')) {
        throw new ConflictException('این تلفن همراه قبلاً ثبت شده است');
      }
      if (fields.includes('nationalId') || fields.includes('username')) {
        throw new ConflictException('این کد ملی قبلاً ثبت شده است');
      }
      throw new ConflictException('این نماینده قبلاً برای گروه ثبت شده است');
    }
    throw error;
  }
}
