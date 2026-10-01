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
import { CreateCaseIdentityDocumentDto } from './dto/create-case-identity-document.dto';
import { FindCaseIdentityDocumentsQueryDto } from './dto/find-case-identity-documents-query.dto';

const documentSelect = {
  id: true,
  title: true,
  isRequired: true,
  gender: true,
  isFixed: true,
} satisfies Prisma.DocumentSelect;

@Injectable()
export class CaseIdentityDocumentsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: FindCaseIdentityDocumentsQueryDto) {
    const where: Prisma.CaseIdentityDocumentWhereInput = {
      document: query.q
        ? { title: containsInsensitive(query.q) }
        : undefined,
    };
    const orderBy = resolveSortOrder<Prisma.CaseIdentityDocumentOrderByWithRelationInput>(
      query.sortBy,
      query.sortDir,
      {
        title: (dir) => ({ document: { title: dir } }),
        isRequired: (dir) => ({ document: { isRequired: dir } }),
        gender: (dir) => ({ document: { gender: dir } }),
      },
      [{ createdAt: 'desc' }, { documentId: 'asc' }],
    );
    const { page, pageSize, skip, take } = paginationArgs(query);
    const [rows, total] = await Promise.all([
      this.prisma.caseIdentityDocument.findMany({
        where,
        orderBy,
        skip,
        take,
        select: {
          documentId: true,
          createdAt: true,
          document: { select: documentSelect },
        },
      }),
      this.prisma.caseIdentityDocument.count({ where }),
    ]);
    return paginatedResult(
      rows.map((row) => ({
        documentId: row.documentId,
        title: row.document.title,
        isRequired: row.document.isRequired,
        gender: row.document.gender,
        isFixed: row.document.isFixed,
        createdAt: row.createdAt,
      })),
      total,
      page,
      pageSize,
    );
  }

  options() {
    return this.prisma.document.findMany({
      where: { caseIdentityDocument: null },
      orderBy: { title: 'asc' },
      select: { id: true, title: true },
    });
  }

  async create(dto: CreateCaseIdentityDocumentDto) {
    const document = await this.prisma.document.findUnique({
      where: { id: dto.documentId },
      select: { id: true },
    });
    if (!document) {
      throw new NotFoundException('مدرک یافت نشد');
    }
    try {
      await this.prisma.caseIdentityDocument.create({
        data: { documentId: dto.documentId },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('این مدرک قبلاً به فهرست اضافه شده است');
      }
      throw error;
    }
    return { ok: true };
  }

  async remove(documentId: string) {
    try {
      await this.prisma.caseIdentityDocument.delete({
        where: { documentId },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException('این مدرک در فهرست نیست');
      }
      throw error;
    }
    return { ok: true };
  }
}
