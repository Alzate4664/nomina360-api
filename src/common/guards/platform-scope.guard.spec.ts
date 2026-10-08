import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PlatformScopeGuard } from './platform-scope.guard';

describe('PlatformScopeGuard', () => {
  let guard: PlatformScopeGuard;
  const findUnique = jest.fn();
  const databaseUser = {
    id: 'platform-user-1',
    isActive: true,
    role: UserRole.SUPER_ADMIN,
    companyId: null,
  };

  const buildContext = (user?: unknown): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: <T>() => ({ user }) as T,
      }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    findUnique.mockReset();
    findUnique.mockResolvedValue(databaseUser);
    guard = new PlatformScopeGuard({
      user: { findUnique },
    } as unknown as PrismaService);
  });

  it('should allow SUPER_ADMIN without a company', async () => {
    const context = buildContext({
      sub: 'platform-user-1',
      email: 'platform@example.com',
      role: UserRole.SUPER_ADMIN,
      companyId: null,
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('should reject a request without an authenticated user', async () => {
    const context = buildContext();

    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('should reject SUPER_ADMIN with a companyId', async () => {
    const context = buildContext({
      sub: 'platform-user-1',
      email: 'platform@example.com',
      role: UserRole.SUPER_ADMIN,
      companyId: 'company-1',
    });

    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
    expect(findUnique).not.toHaveBeenCalled();
  });

  it.each([
    UserRole.OWNER,
    UserRole.ADMIN,
    UserRole.ACCOUNTANT,
    UserRole.VIEWER,
  ])('should reject tenant role %s even without a company', async (role) => {
    const context = buildContext({
      sub: 'tenant-user-1',
      email: 'tenant@example.com',
      role,
      companyId: null,
    });

    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('should reject a tenant role with a companyId', async () => {
    const context = buildContext({
      sub: 'tenant-user-1',
      email: 'tenant@example.com',
      role: UserRole.OWNER,
      companyId: 'company-1',
    });

    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('should reject an unknown role without a company', async () => {
    const context = buildContext({
      sub: 'user-1',
      email: 'unknown@example.com',
      role: 'UNKNOWN_ROLE',
      companyId: null,
    });

    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('should reject SUPER_ADMIN when companyId is missing', async () => {
    const context = buildContext({
      sub: 'platform-user-1',
      email: 'platform@example.com',
      role: UserRole.SUPER_ADMIN,
    });

    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
    expect(findUnique).not.toHaveBeenCalled();
  });
  it.each([
    ['missing user', null],
    ['inactive user', { ...databaseUser, isActive: false }],
    ['tenant role', { ...databaseUser, role: UserRole.OWNER }],
    ['company scope', { ...databaseUser, companyId: 'company-1' }],
  ])('should reject database %s', async (_case, result) => {
    findUnique.mockResolvedValue(result);

    await expect(
      guard.canActivate(
        buildContext({ ...databaseUser, sub: databaseUser.id }),
      ),
    ).rejects.toThrow('El usuario no tiene acceso al ámbito de plataforma');
  });

  it.each([undefined, null, 123, {}, [], '', ' ', '\t\n'])(
    'should reject invalid subject %p without querying Prisma',
    async (sub) => {
      await expect(
        guard.canActivate(buildContext({ ...databaseUser, sub })),
      ).rejects.toThrow(ForbiddenException);
      expect(findUnique).not.toHaveBeenCalled();
    },
  );

  it.each([null, 'user', 123])(
    'should reject invalid identity %p without querying Prisma',
    async (user) => {
      await expect(guard.canActivate(buildContext(user))).rejects.toThrow(
        'Usuario no autenticado',
      );
      expect(findUnique).not.toHaveBeenCalled();
    },
  );

  it('should look up the JWT subject and select only authorization fields', async () => {
    const sub = 'another-platform-user';
    await expect(
      guard.canActivate(buildContext({ ...databaseUser, sub })),
    ).resolves.toBe(true);
    expect(findUnique).toHaveBeenCalledTimes(1);
    expect(findUnique).toHaveBeenCalledWith({
      where: { id: sub },
      select: { id: true, isActive: true, role: true, companyId: true },
    });
  });

  it('should perform a fresh database lookup on every invocation', async () => {
    const context = buildContext({
      sub: databaseUser.id,
      email: 'platform@example.com',
      role: UserRole.SUPER_ADMIN,
      companyId: null,
    });
    findUnique.mockResolvedValue(databaseUser);

    await expect(guard.canActivate(context)).resolves.toBe(true);

    findUnique.mockResolvedValue({ ...databaseUser, isActive: false });

    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
    expect(findUnique).toHaveBeenCalledTimes(2);
  });

  it('should propagate database errors', async () => {
    const error = new Error('Database lookup failed');
    findUnique.mockRejectedValue(error);

    await expect(
      guard.canActivate(
        buildContext({ ...databaseUser, sub: databaseUser.id }),
      ),
    ).rejects.toBe(error);
    expect(findUnique).toHaveBeenCalledTimes(1);
  });
});
