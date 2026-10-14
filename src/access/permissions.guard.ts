import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { hasAnyPermission, hasPermission } from './access.util';
import { formationMayPost, issuerCanRead, issuerMayPost } from './issuance-case-read';
import { managementReviewerCanRead, matchCaseWizardRead } from './management-review-case-read';
import { placesOfficerCanRead } from './places-case-read';
import { normalizeApiPath, resolveAccessDecision } from './route-permissions';

type RequestAccessUser = {
  id?: string;
  isAdmin?: boolean;
  permissionCodes?: string[];
};

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      method: string;
      originalUrl?: string;
      url?: string;
      query?: Record<string, unknown>;
      user?: RequestAccessUser;
    }>();
    const decision = resolveAccessDecision(
      request.method,
      request.originalUrl ?? request.url ?? '/',
      request.query ?? {},
    );

    if (decision.kind === 'public') {
      return true;
    }

    const user = request.user;
    if (!user?.id) {
      throw new UnauthorizedException();
    }

    if (decision.kind === 'auth' || user.isAdmin) {
      return true;
    }

    const access = {
      isAdmin: Boolean(user.isAdmin),
      permissionCodes: user.permissionCodes ?? [],
    };
    if (hasAnyPermission(access, decision.permissions)) {
      return true;
    }

    const rawPath = request.originalUrl ?? request.url ?? '/';
    const query = request.query ?? {};
    if (
      request.method.toUpperCase() === 'GET' &&
      hasPermission(access, 'cases.places') &&
      (await placesOfficerCanRead(this.prisma, rawPath, query))
    ) {
      return true;
    }
    if (
      request.method.toUpperCase() === 'GET' &&
      hasPermission(access, 'cases.management-reviews') &&
      (await managementReviewerCanRead(this.prisma, user.id, rawPath, query))
    ) {
      return true;
    }
    if (
      request.method.toUpperCase() === 'GET' &&
      hasPermission(access, 'cases.issuance') &&
      (await issuerCanRead(this.prisma, rawPath, query))
    ) {
      return true;
    }
    if (
      request.method.toUpperCase() === 'GET' &&
      hasPermission(access, 'cases.formation') &&
      !normalizeApiPath(rawPath).startsWith('/violations') &&
      (await matchCaseWizardRead(this.prisma, rawPath, query, {
        caseVisible: async () => true,
        userVisible: async () => true,
        nationalIdVisible: async () => false,
      }))
    ) {
      return true;
    }
    if (request.method.toUpperCase() === 'POST' && hasPermission(access, 'cases.issuance') && issuerMayPost(rawPath)) {
      return true;
    }
    if (request.method.toUpperCase() === 'POST' && hasPermission(access, 'cases.formation') && formationMayPost(rawPath)) {
      return true;
    }

    throw new ForbiddenException('دسترسی مجاز نیست');
  }
}
