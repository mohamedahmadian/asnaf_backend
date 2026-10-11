import { BadRequestException, Injectable } from '@nestjs/common';
import { Jimp, JimpMime } from 'jimp';
import { mkdir, readFile, rm, writeFile } from 'fs/promises';
import { dirname, join, normalize, sep } from 'path';

const MAX_EDGE = 1600;
const JPEG_QUALITY = 88;
const MAX_BYTES = 8 * 1024 * 1024;

export type StoredPersonFile = {
  storageKey: string;
  mimeType: string;
  byteSize: number;
  originalName: string;
};

@Injectable()
export class PersonFileStorage {
  private root() {
    return process.env.FILE_STORAGE_DIR?.trim() || join(process.cwd(), 'storage');
  }

  async save(input: {
    personId: string;
    documentId: string;
    version: number;
    buffer: Buffer;
    mimeType: string;
    originalName: string;
  }): Promise<StoredPersonFile> {
    const prepared = await this.prepare(input.buffer, input.mimeType);

    const storageKey = [
      'persons',
      input.personId,
      'documents',
      input.documentId,
      `v${input.version}.${prepared.ext}`,
    ].join('/');
    const absolute = this.resolve(storageKey);
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, prepared.data);
    return {
      storageKey,
      mimeType: prepared.mimeType,
      byteSize: prepared.data.length,
      originalName: input.originalName,
    };
  }

  async saveCaseActivity(input: {
    personId: string;
    caseFileId: string;
    documentId: string;
    version: number;
    buffer: Buffer;
    mimeType: string;
    originalName: string;
  }): Promise<StoredPersonFile> {
    const prepared = await this.prepare(input.buffer, input.mimeType);
    const storageKey = [
      'persons',
      input.personId,
      'cases',
      input.caseFileId,
      'documents',
      input.documentId,
      `v${input.version}.${prepared.ext}`,
    ].join('/');
    const absolute = this.resolve(storageKey);
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, prepared.data);
    return {
      storageKey,
      mimeType: prepared.mimeType,
      byteSize: prepared.data.length,
      originalName: input.originalName,
    };
  }

  async saveInquiry(input: {
    personId: string;
    inquiryId: string;
    fileId: string;
    buffer: Buffer;
    mimeType: string;
    originalName: string;
  }): Promise<StoredPersonFile> {
    const prepared = await this.prepare(input.buffer, input.mimeType);
    const storageKey = [
      'persons',
      input.personId,
      'inquiries',
      input.inquiryId,
      `${input.fileId}.${prepared.ext}`,
    ].join('/');
    const absolute = this.resolve(storageKey);
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, prepared.data);
    return {
      storageKey,
      mimeType: prepared.mimeType,
      byteSize: prepared.data.length,
      originalName: input.originalName,
    };
  }

  async savePlaces(input: {
    personId: string;
    reviewId: string;
    fileId: string;
    buffer: Buffer;
    mimeType: string;
    originalName: string;
  }): Promise<StoredPersonFile> {
    const prepared = await this.prepare(input.buffer, input.mimeType);
    const storageKey = [
      'persons',
      input.personId,
      'places',
      input.reviewId,
      `${input.fileId}.${prepared.ext}`,
    ].join('/');
    const absolute = this.resolve(storageKey);
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, prepared.data);
    return {
      storageKey,
      mimeType: prepared.mimeType,
      byteSize: prepared.data.length,
      originalName: input.originalName,
    };
  }

  async saveSuspension(input: {
    personId: string;
    caseFileId: string;
    suspensionId: string;
    fileId: string;
    buffer: Buffer;
    mimeType: string;
    originalName: string;
  }): Promise<StoredPersonFile> {
    const prepared = this.asAudio(input.buffer, input.mimeType, input.originalName) ?? (await this.prepare(input.buffer, input.mimeType));
    const storageKey = [
      'persons',
      input.personId,
      'cases',
      input.caseFileId,
      'suspensions',
      input.suspensionId,
      `${input.fileId}.${prepared.ext}`,
    ].join('/');
    const absolute = this.resolve(storageKey);
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, prepared.data);
    return {
      storageKey,
      mimeType: prepared.mimeType,
      byteSize: prepared.data.length,
      originalName: input.originalName,
    };
  }

  async saveManagementReview(input: {
    personId: string;
    reviewId: string;
    fileId: string;
    buffer: Buffer;
    mimeType: string;
    originalName: string;
  }): Promise<StoredPersonFile> {
    const prepared = await this.prepare(input.buffer, input.mimeType);
    const storageKey = [
      'persons',
      input.personId,
      'management-reviews',
      input.reviewId,
      `${input.fileId}.${prepared.ext}`,
    ].join('/');
    const absolute = this.resolve(storageKey);
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, prepared.data);
    return {
      storageKey,
      mimeType: prepared.mimeType,
      byteSize: prepared.data.length,
      originalName: input.originalName,
    };
  }

  async read(storageKey: string) {
    return readFile(this.resolve(storageKey));
  }

  async remove(storageKey: string) {
    await rm(this.resolve(storageKey), { force: true });
  }

  /** پوشهٔ فایل‌های یک شخص: مدارک، استعلام، اماکن و تایید مدیریتی. */
  async removePerson(personId: string) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(personId)) {
      return;
    }
    await rm(this.resolve(`persons/${personId}`), { recursive: true, force: true });
  }

  private resolve(storageKey: string) {
    const root = this.root();
    const absolute = normalize(join(root, storageKey));
    if (absolute !== root && !absolute.startsWith(root + sep)) {
      throw new BadRequestException('مسیر فایل نامعتبر است');
    }
    return absolute;
  }

  private asAudio(buffer: Buffer, mimeType: string, originalName: string) {
    if (!buffer?.length || buffer.length > MAX_BYTES) return null;
    const mime = mimeType.split(';')[0].trim().toLowerCase();
    const byMime: Record<string, string> = {
      'audio/mpeg': 'mp3',
      'audio/mp3': 'mp3',
      'audio/wav': 'wav',
      'audio/x-wav': 'wav',
      'audio/webm': 'webm',
      'audio/ogg': 'ogg',
      'audio/mp4': 'm4a',
      'audio/aac': 'aac',
      'audio/x-m4a': 'm4a',
    };
    if (byMime[mime]) return { data: buffer, mimeType: mime, ext: byMime[mime] };
    const match = /\.(webm|ogg|mp3|m4a|wav|aac)$/i.exec(originalName);
    if (!match) return null;
    if (mime && mime !== 'application/octet-stream' && !mime.startsWith('audio/')) return null;
    const ext = match[1].toLowerCase();
    const byExt: Record<string, string> = {
      mp3: 'audio/mpeg',
      wav: 'audio/wav',
      webm: 'audio/webm',
      ogg: 'audio/ogg',
      m4a: 'audio/mp4',
      aac: 'audio/aac',
    };
    return { data: buffer, mimeType: byExt[ext] ?? 'audio/mpeg', ext };
  }

  private async prepare(buffer: Buffer, mimeType: string) {
    if (!buffer?.length) {
      throw new BadRequestException('فایل ارسال نشده است');
    }
    if (buffer.length > MAX_BYTES) {
      throw new BadRequestException('حجم فایل بیش از حد مجاز است');
    }
    if (mimeType.startsWith('image/')) return this.prepareImage(buffer);
    if (mimeType === 'application/pdf') {
      return { data: buffer, mimeType: 'application/pdf', ext: 'pdf' };
    }
    throw new BadRequestException('فقط تصویر یا PDF مجاز است');
  }

  private async prepareImage(buffer: Buffer) {
    let image;
    try {
      image = await Jimp.read(buffer);
    } catch {
      throw new BadRequestException('فایل تصویر نامعتبر است');
    }
    if (image.width > MAX_EDGE || image.height > MAX_EDGE) {
      image.scaleToFit({ w: MAX_EDGE, h: MAX_EDGE });
    }
    const data = await image.getBuffer(JimpMime.jpeg, { quality: JPEG_QUALITY });
    return { data, mimeType: JimpMime.jpeg, ext: 'jpg' };
  }
}
