import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { PLATFORM_USER_ROLES } from '../types/authenticated-user.type';
import { PrismaService } from '../../prisma/prisma.service';
import { UserRole } from '@prisma/client';

@Injectable()
export class PlatformScopeGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{ user?: unknown }>();

    const user = request.user;

    if (!user || typeof user !== 'object') {
      throw new ForbiddenException('Usuario no autenticado');
    }

    const identity = user as Record<string, unknown>;

    const role = identity.role;
    const companyId = identity.companyId;
    const sub = identity.sub;

    const hasPlatformRole =
      typeof role === 'string' &&
      (PLATFORM_USER_ROLES as readonly string[]).includes(role);

    const hasPlatformScope = companyId === null;

    if (
      !hasPlatformRole ||
      role !== UserRole.SUPER_ADMIN ||
      !hasPlatformScope ||
      typeof sub !== 'string' ||
      sub.trim().length === 0
    ) {
      throw new ForbiddenException(
        'El usuario no tiene acceso al ámbito de plataforma',
      );
    }

    const databaseUser = await this.prisma.user.findUnique({
      where: { id: sub },
      select: { id: true, isActive: true, role: true, companyId: true },
    });

    if (
      !databaseUser ||
      databaseUser.isActive !== true ||
      databaseUser.role !== UserRole.SUPER_ADMIN ||
      databaseUser.companyId !== null
    ) {
      throw new ForbiddenException(
        'El usuario no tiene acceso al ámbito de plataforma',
      );
    }

    return true;
  }
}
