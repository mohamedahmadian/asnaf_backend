import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';

export type IdentityUploadFile = {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
};

export const identityDocumentFile = FileInterceptor('file', {
  storage: memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
});

export function requireIdentityUpload(file: IdentityUploadFile | undefined, actorId?: string) {
  if (!actorId) throw new UnauthorizedException();
  if (!file?.buffer) throw new BadRequestException('فایل مدرک لازم است');
  return { file, actorId };
}

export function sendIdentityDocumentFile(
  res: Response,
  file: { mimeType: string; byteSize: number; originalName: string | null; data: Buffer },
) {
  res.setHeader('Content-Type', file.mimeType);
  res.setHeader('Content-Length', String(file.byteSize));
  if (file.originalName) {
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(file.originalName)}"`,
    );
  }
  res.send(file.data);
}
