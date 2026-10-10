import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SaveCaseGeneralSettingsDto } from './dto/save-case-general-settings.dto';

const SETTINGS_ID = 'default';

@Injectable()
export class CaseGeneralSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async get() {
    const [row, roles] = await Promise.all([
      this.ensure(),
      this.prisma.role.findMany({
        select: { id: true, name: true },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
      }),
    ]);
    return {
      editAfterIssuance: row.editAfterIssuance,
      editorRoleId: row.editorRoleId,
      roles,
    };
  }

  async save(dto: SaveCaseGeneralSettingsDto) {
    const editorRoleId = dto.editorRoleId ?? null;
    if (dto.editAfterIssuance && !editorRoleId) {
      throw new BadRequestException('نقش مجاز برای ویرایش را انتخاب کنید');
    }
    if (editorRoleId) {
      const role = await this.prisma.role.findUnique({
        where: { id: editorRoleId },
        select: { id: true },
      });
      if (!role) throw new NotFoundException('نقش یافت نشد');
    }
    await this.prisma.caseGeneralSettings.upsert({
      where: { id: SETTINGS_ID },
      create: { id: SETTINGS_ID, editAfterIssuance: dto.editAfterIssuance, editorRoleId },
      update: { editAfterIssuance: dto.editAfterIssuance, editorRoleId },
    });
    return this.get();
  }

  /**
   * null: ویرایش بعد از صدور خاموش است یا نقشی انتخاب نشده.
   * true: کاربر همان نقش را دارد.
   * false: تنظیم روشن است ولی کاربر آن نقش را ندارد.
   */
  async userMayEditIssuedCase(userId: string) {
    const row = await this.prisma.caseGeneralSettings.findUnique({
      where: { id: SETTINGS_ID },
      select: { editAfterIssuance: true, editorRoleId: true },
    });
    if (!row?.editAfterIssuance || !row.editorRoleId) return null;
    const match = await this.prisma.userRole.findUnique({
      where: { userId_roleId: { userId, roleId: row.editorRoleId } },
      select: { userId: true },
    });
    return Boolean(match);
  }

  private ensure() {
    return this.prisma.caseGeneralSettings.upsert({
      where: { id: SETTINGS_ID },
      create: { id: SETTINGS_ID },
      update: {},
      select: { editAfterIssuance: true, editorRoleId: true },
    });
  }
}
