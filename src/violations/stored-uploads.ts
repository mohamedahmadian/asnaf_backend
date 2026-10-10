import { BadRequestException } from '@nestjs/common';
import { ViolationAttachmentKind } from '../generated/prisma/client';
import { ImagesService } from '../images/images.service';
import { PrismaService } from '../prisma/prisma.service';

const MAX_FILES = 12;
const MAX_BYTES = 8 * 1024 * 1024;

const FILE_MIME = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'application/zip',
  'application/x-zip-compressed',
  'audio/webm',
  'audio/ogg',
  'audio/mp4',
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/aac',
  'audio/x-m4a',
]);

export type UploadFile = {
  buffer: Buffer;
  size: number;
  mimetype: string;
  originalname: string;
};

export type StoredUpload = {
  kind: ViolationAttachmentKind;
  imageId?: string;
  fileId?: string;
  originalName: string;
};

export async function storeUploads(
  files: UploadFile[] | undefined,
  images: ImagesService,
  prisma: PrismaService,
) {
  const list = files ?? [];
  if (list.length > MAX_FILES) {
    throw new BadRequestException('حداکثر ۱۲ پیوست مجاز است');
  }
  const stored: StoredUpload[] = [];
  try {
    for (const file of list) {
      stored.push(await storeOne(file, images, prisma));
    }
    return stored;
  } catch (error) {
    await purgeUploads(prisma, stored);
    throw error;
  }
}

export async function purgeUploads(
  prisma: PrismaService,
  items: { imageId?: string | null; fileId?: string | null }[],
) {
  const imageIds = items
    .map((item) => item.imageId)
    .filter((id): id is string => Boolean(id));
  const fileIds = items
    .map((item) => item.fileId)
    .filter((id): id is string => Boolean(id));
  if (imageIds.length) {
    await prisma.storedImage.deleteMany({ where: { id: { in: imageIds } } });
  }
  if (fileIds.length) {
    await prisma.storedFile.deleteMany({ where: { id: { in: fileIds } } });
  }
}

async function storeOne(
  file: UploadFile,
  images: ImagesService,
  prisma: PrismaService,
): Promise<StoredUpload> {
  if (!file?.buffer?.length) {
    throw new BadRequestException('فایل پیوست خالی است');
  }
  if (file.size > MAX_BYTES) {
    throw new BadRequestException('حجم پیوست بیش از حد مجاز است');
  }
  const originalName = decodeFileName(file.originalname);
  if (file.mimetype.startsWith('image/')) {
    const image = await images.store(file);
    return {
      kind: ViolationAttachmentKind.IMAGE,
      imageId: image.id,
      originalName,
    };
  }
  if (!FILE_MIME.has(file.mimetype)) {
    throw new BadRequestException('نوع فایل پیوست مجاز نیست');
  }
  const saved = await prisma.storedFile.create({
    data: {
      mimeType: file.mimetype,
      data: Buffer.from(file.buffer),
      byteSize: file.size,
      originalName,
    },
    select: { id: true },
  });
  return {
    kind: ViolationAttachmentKind.FILE,
    fileId: saved.id,
    originalName,
  };
}

function decodeFileName(name: string) {
  const raw = (name || 'file').trim() || 'file';
  const utf8 = Buffer.from(raw, 'latin1').toString('utf8');
  if (utf8.includes('\uFFFD')) return raw.slice(0, 255);
  return utf8.slice(0, 255);
}
