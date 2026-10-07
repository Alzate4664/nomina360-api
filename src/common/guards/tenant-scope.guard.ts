import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { TENANT_USER_ROLES } from '../types/authenticated-user.type';

@Injectable()
export class TenantScopeGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ user?: unknown }>();

    const user = request.user;

    if (!user || typeof user !== 'object') {
      throw new ForbiddenException('Usuario no autenticado');
    }

    const identity = user as Record<string, unknown>;

    const role = identity.role;
    const companyId = identity.companyId;

    const hasTenantRole =
      typeof role === 'string' &&
      (TENANT_USER_ROLES as readonly string[]).includes(role);

    const hasValidCompanyId =
      typeof companyId === 'string' && companyId.trim().length > 0;

    if (!hasTenantRole || !hasValidCompanyId) {
      throw new ForbiddenException(
        'El usuario no tiene acceso al ámbito de empresa',
      );
    }

    return true;
  }
}
