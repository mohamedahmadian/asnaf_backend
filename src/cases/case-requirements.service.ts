import { BadRequestException, Injectable } from '@nestjs/common';
import { CaseRequestType, DocumentGender, Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SaveCaseRequirementsDto } from './dto/save-case-requirements.dto';

const TYPES = [CaseRequestType.ISSUANCE, CaseRequestType.RENEWAL, CaseRequestType.LOCATION_CHANGE] as const;

@Injectable()
export class CaseRequirementsService {
  constructor(private readonly prisma: PrismaService) {}

  async get(requestType: string, jobId?: string) {
    if (!TYPES.includes(requestType as (typeof TYPES)[number])) {
      throw new BadRequestException('نوع درخواست معتبر نیست');
    }
    const type = requestType as CaseRequestType;
    const [documents, inquiries] = await Promise.all([
      this.prisma.documentRequirement.findMany({
        where: { requestType: type, jobId: jobId ?? null },
        orderBy: { document: { title: 'asc' } },
        select: {
          gender: true,
          isRequired: true,
          document: { select: { id: true, title: true } },
        },
      }),
      this.prisma.inquiryRequirement.findMany({
        where: { requestType: type, jobId: jobId ?? null },
        orderBy: { inquiryCenter: { name: 'asc' } },
        select: { inquiryCenter: { select: { id: true, name: true, isActive: true } } },
      }),
    ]);
    return {
      requestType: type,
      jobId: jobId ?? null,
      documents: documents.map((row) => ({
        id: row.document.id,
        title: row.document.title,
        gender: row.gender,
        isRequired: row.isRequired,
      })),
      inquiries: inquiries.map((row) => row.inquiryCenter),
    };
  }

  async save(dto: SaveCaseRequirementsDto, jobId?: string) {
    const documents = new Map<string, { gender: DocumentGender; isRequired: boolean }>();
    for (const item of dto.documents) {
      documents.set(item.documentId, { gender: item.gender, isRequired: item.isRequired });
    }
    const centers = [...new Set(dto.inquiries.map((item) => item.inquiryCenterId))];
    const [foundDocs, foundCenters] = await Promise.all([
      this.prisma.document.findMany({
        where: { id: { in: [...documents.keys()] } },
        select: { id: true },
      }),
      centers.length
        ? this.prisma.inquiryCenter.findMany({ where: { id: { in: centers } }, select: { id: true } })
        : Promise.resolve([]),
    ]);
    if (foundDocs.length !== documents.size) throw new BadRequestException('مدرک یافت نشد');
    if (foundCenters.length !== centers.length) throw new BadRequestException('مرکز استعلام یافت نشد');
    if (jobId) {
      const job = await this.prisma.job.findUnique({ where: { id: jobId }, select: { id: true } });
      if (!job) throw new BadRequestException('شغل یافت نشد');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.documentRequirement.deleteMany({
        where: { requestType: dto.requestType, jobId: jobId ?? null },
      });
      await tx.inquiryRequirement.deleteMany({
        where: { requestType: dto.requestType, jobId: jobId ?? null },
      });
      if (documents.size) {
        await tx.documentRequirement.createMany({
          data: [...documents.entries()].map(([documentId, item]) => ({
            documentId,
            requestType: dto.requestType,
            jobId: jobId ?? null,
            gender: item.gender,
            isRequired: item.isRequired,
          })),
        });
      }
      if (centers.length) {
        await tx.inquiryRequirement.createMany({
          data: centers.map((inquiryCenterId) => ({
            inquiryCenterId,
            requestType: dto.requestType,
            jobId: jobId ?? null,
          })),
        });
      }
    });
    return this.get(dto.requestType, jobId);
  }

  async syncJobIssuance(
    jobId: string,
    documents: { documentId: string; gender: DocumentGender; isRequired: boolean }[] | undefined,
    inquiryCenterIds: string[] | undefined,
    tx: Prisma.TransactionClient,
  ) {
    if (documents) {
      await tx.documentRequirement.deleteMany({
        where: { jobId, requestType: CaseRequestType.ISSUANCE },
      });
      if (documents.length) {
        await tx.documentRequirement.createMany({
          data: documents.map((item) => ({
            jobId,
            requestType: CaseRequestType.ISSUANCE,
            documentId: item.documentId,
            gender: item.gender,
            isRequired: item.isRequired,
          })),
        });
      }
    }
    if (inquiryCenterIds) {
      await tx.inquiryRequirement.deleteMany({
        where: { jobId, requestType: CaseRequestType.ISSUANCE },
      });
      if (inquiryCenterIds.length) {
        await tx.inquiryRequirement.createMany({
          data: inquiryCenterIds.map((inquiryCenterId) => ({
            jobId,
            requestType: CaseRequestType.ISSUANCE,
            inquiryCenterId,
          })),
        });
      }
    }
  }
}
