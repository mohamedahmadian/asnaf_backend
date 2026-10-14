import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { hasPermission } from '../access/access.util';

export type ActionUser = {
  id: string;
  isAdmin?: boolean;
  permissionCodes?: string[];
};

export function assertCanIssue(user: ActionUser | undefined) {
  if (!user?.id) throw new UnauthorizedException();
  if (user.isAdmin) return user;
  const access = { isAdmin: false, permissionCodes: user.permissionCodes ?? [] };
  if (hasPermission(access, 'cases.issuance')) return user;
  throw new ForbiddenException('صدور مجوز برای نقش شما ممکن نیست');
}

export function assertAdminActor(user: ActionUser | undefined) {
  if (!user?.id) throw new UnauthorizedException();
  if (!user.isAdmin) throw new ForbiddenException('بازگشایی این مرحله فقط برای مدیر است');
  return user;
}
