import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { PLATFORM_USER_ROLES } from '../types/authenticated-user.type';

@Injectable()
export class PlatformScopeGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ user?: unknown }>();

    const user = request.user;

    if (!user || typeof user !== 'object') {
      throw new ForbiddenException('Usuario no autenticado');
    }

    const identity = user as Record<string, unknown>;

    const role = identity.role;
    const companyId = identity.companyId;

    const hasPlatformRole =
      typeof role === 'string' &&
      (PLATFORM_USER_ROLES as readonly string[]).includes(role);

    const hasPlatformScope = companyId === null;

    if (!hasPlatformRole || !hasPlatformScope) {
      throw new ForbiddenException(
        'El usuario no tiene acceso al ámbito de plataforma',
      );
    }

    return true;
  }
}
