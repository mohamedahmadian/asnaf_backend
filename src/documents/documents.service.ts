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
import { CreateDocumentDto } from './dto/create-document.dto';
import { FindDocumentsQueryDto } from './dto/find-documents-query.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';

const documentSelect = {
  id: true,
  title: true,
  isRequired: true,
  gender: true,
  isFixed: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.DocumentSelect;

@Injectable()
export class DocumentsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: FindDocumentsQueryDto) {
    const where: Prisma.DocumentWhereInput = {
      isRequired: query.isRequired,
      isFixed: query.isFixed,
      gender: query.gender,
      OR: query.q ? [{ title: containsInsensitive(query.q) }] : undefined,
    };
    const orderBy = resolveSortOrder<Prisma.DocumentOrderByWithRelationInput>(
      query.sortBy,
      query.sortDir,
      {
        title: (dir) => ({ title: dir }),
        isRequired: (dir) => ({ isRequired: dir }),
        gender: (dir) => ({ gender: dir }),
        isFixed: (dir) => ({ isFixed: dir }),
      },
      [{ createdAt: 'desc' }, { id: 'asc' }],
    );
    if (!wantsPagination(query)) {
      return this.prisma.document.findMany({
        where,
        orderBy,
        select: documentSelect,
      });
    }
    const { page, pageSize, skip, take } = paginationArgs(query);
    const [items, total] = await Promise.all([
      this.prisma.document.findMany({
        where,
        orderBy,
        skip,
        take,
        select: documentSelect,
      }),
      this.prisma.document.count({ where }),
    ]);
    return paginatedResult(items, total, page, pageSize);
  }

  async findOne(id: string) {
    const item = await this.prisma.document.findUnique({
      where: { id },
      select: documentSelect,
    });
    if (!item) {
      throw new NotFoundException('مدرک یافت نشد');
    }
    return item;
  }

  async create(dto: CreateDocumentDto) {
    try {
      return await this.prisma.document.create({
        data: {
          title: dto.title,
          isRequired: dto.isRequired,
          gender: dto.gender,
          isFixed: dto.isFixed,
        },
        select: documentSelect,
      });
    } catch (error) {
      this.rethrowUnique(error);
    }
  }

  async update(id: string, dto: UpdateDocumentDto) {
    await this.findOne(id);
    try {
      return await this.prisma.document.update({
        where: { id },
        data: {
          title: dto.title,
          isRequired: dto.isRequired,
          gender: dto.gender,
          isFixed: dto.isFixed,
        },
        select: documentSelect,
      });
    } catch (error) {
      this.rethrowUnique(error);
    }
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.document.delete({ where: { id } });
    return { ok: true };
  }

  private rethrowUnique(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException('این مدرک قبلاً ثبت شده است');
    }
    throw error;
  }
}
