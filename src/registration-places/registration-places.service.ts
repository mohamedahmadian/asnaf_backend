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
    try {
      return await this.prisma.registrationPlace.create({
        data: {
          title: dto.title,
          description: dto.description,
          isActive: dto.isActive,
        },
        select: registrationPlaceSelect,
      });
    } catch (error) {
      this.rethrowUnique(error);
    }
  }

  async update(id: string, dto: UpdateRegistrationPlaceDto) {
    await this.findOne(id);
    try {
      return await this.prisma.registrationPlace.update({
        where: { id },
        data: {
          title: dto.title,
          description: dto.description,
          isActive: dto.isActive,
        },
        select: registrationPlaceSelect,
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
