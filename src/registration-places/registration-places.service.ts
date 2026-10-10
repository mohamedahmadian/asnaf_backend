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
import { CreateRegistrationPlaceDto } from './dto/create-registration-place.dto';
import { FindRegistrationPlacesQueryDto } from './dto/find-registration-places-query.dto';
import { UpdateRegistrationPlaceDto } from './dto/update-registration-place.dto';

const registrationPlaceSelect = {
  id: true,
  title: true,
  description: true,
  isActive: true,
  isDefault: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.RegistrationPlaceSelect;

@Injectable()
export class RegistrationPlacesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: FindRegistrationPlacesQueryDto) {
    const where: Prisma.RegistrationPlaceWhereInput = {
      OR: query.q
        ? [
            { title: containsInsensitive(query.q) },
            { description: containsInsensitive(query.q) },
          ]
        : undefined,
    };
    const orderBy =
      resolveSortOrder<Prisma.RegistrationPlaceOrderByWithRelationInput>(
        query.sortBy,
        query.sortDir,
        {
          title: (dir) => ({ title: dir }),
          description: (dir) => ({ description: dir }),
          isActive: (dir) => ({ isActive: dir }),
          isDefault: (dir) => ({ isDefault: dir }),
        },
        [{ createdAt: 'desc' }, { id: 'asc' }],
      );
    if (!wantsPagination(query)) {
      return this.prisma.registrationPlace.findMany({
        where,
        orderBy,
        select: registrationPlaceSelect,
      });
    }
    const { page, pageSize, skip, take } = paginationArgs(query);
    const [items, total] = await Promise.all([
      this.prisma.registrationPlace.findMany({
        where,
        orderBy,
        skip,
        take,
        select: registrationPlaceSelect,
      }),
      this.prisma.registrationPlace.count({ where }),
    ]);
    return paginatedResult(items, total, page, pageSize);
  }

  async findOne(id: string) {
    const item = await this.prisma.registrationPlace.findUnique({
      where: { id },
      select: registrationPlaceSelect,
    });
    if (!item) {
      throw new NotFoundException('محل ثبت یافت نشد');
    }
    return item;
  }

  async create(dto: CreateRegistrationPlaceDto) {
    const isActive = dto.isActive ?? true;
    const isDefault = Boolean(dto.isDefault && isActive);
    try {
      return await this.prisma.$transaction(async (tx) => {
        if (isDefault) await this.clearDefault(tx);
        return tx.registrationPlace.create({
          data: {
            title: dto.title,
            description: dto.description,
            isActive,
            isDefault,
          },
          select: registrationPlaceSelect,
        });
      });
    } catch (error) {
      this.rethrowUnique(error);
    }
  }

  async update(id: string, dto: UpdateRegistrationPlaceDto) {
    const current = await this.findOne(id);
    const isActive = dto.isActive ?? current.isActive;
    const isDefault = Boolean((dto.isDefault ?? current.isDefault) && isActive);
    try {
      return await this.prisma.$transaction(async (tx) => {
        if (isDefault) await this.clearDefault(tx, id);
        return tx.registrationPlace.update({
          where: { id },
          data: {
            title: dto.title,
            description: dto.description,
            isActive: dto.isActive,
            isDefault,
          },
          select: registrationPlaceSelect,
        });
      });
    } catch (error) {
      this.rethrowUnique(error);
    }
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.registrationPlace.delete({ where: { id } });
    return { ok: true };
  }

  private clearDefault(
    tx: Prisma.TransactionClient,
    exceptId?: string,
  ) {
    return tx.registrationPlace.updateMany({
      where: {
        isDefault: true,
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      data: { isDefault: false },
    });
  }

  private rethrowUnique(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException('این محل ثبت قبلاً ثبت شده است');
    }
    throw error;
  }
}
