import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  containsInsensitive,
  paginatedResult,
  paginationArgs,
  wantsPagination,
} from '../common/pagination';
import { resolveSortOrder } from '../common/sort-query';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateStaffPostDto } from './dto/create-staff-post.dto';
import { FindStaffPostsQueryDto } from './dto/find-staff-posts-query.dto';
import { UpdateStaffPostDto } from './dto/update-staff-post.dto';

const staffPostSelect = {
  id: true,
  title: true,
  description: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.StaffPostSelect;

@Injectable()
export class StaffPostsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: FindStaffPostsQueryDto) {
    const where: Prisma.StaffPostWhereInput = {
      OR: query.q
        ? [
            { title: containsInsensitive(query.q) },
            { description: containsInsensitive(query.q) },
          ]
        : undefined,
    };
    const orderBy = resolveSortOrder<Prisma.StaffPostOrderByWithRelationInput>(
      query.sortBy,
      query.sortDir,
      {
        title: (dir) => ({ title: dir }),
        description: (dir) => ({ description: dir }),
        isActive: (dir) => ({ isActive: dir }),
      },
      [{ createdAt: 'desc' }, { id: 'asc' }],
    );
    if (!wantsPagination(query)) {
      return this.prisma.staffPost.findMany({
        where,
        orderBy,
        select: staffPostSelect,
      });
    }
    const { page, pageSize, skip, take } = paginationArgs(query);
    const [items, total] = await Promise.all([
      this.prisma.staffPost.findMany({
        where,
        orderBy,
        skip,
        take,
        select: staffPostSelect,
      }),
      this.prisma.staffPost.count({ where }),
    ]);
    return paginatedResult(items, total, page, pageSize);
  }

  async findOne(id: string) {
    const item = await this.prisma.staffPost.findUnique({
      where: { id },
      select: staffPostSelect,
    });
    if (!item) {
      throw new NotFoundException('سمت یافت نشد');
    }
    return item;
  }

  async create(dto: CreateStaffPostDto) {
    try {
      return await this.prisma.staffPost.create({
        data: {
          title: dto.title,
          description: dto.description,
          isActive: dto.isActive,
        },
        select: staffPostSelect,
      });
    } catch (error) {
      this.rethrowUnique(error);
    }
  }

  async update(id: string, dto: UpdateStaffPostDto) {
    await this.findOne(id);
    try {
      return await this.prisma.staffPost.update({
        where: { id },
        data: {
          title: dto.title,
          description: dto.description,
          isActive: dto.isActive,
        },
        select: staffPostSelect,
      });
    } catch (error) {
      this.rethrowUnique(error);
    }
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.staffPost.delete({ where: { id } });
    return { ok: true };
  }

  private rethrowUnique(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException('این سمت قبلاً ثبت شده است');
    }
    throw error;
  }
}
