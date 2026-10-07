import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PlatformScopeGuard } from './platform-scope.guard';

describe('PlatformScopeGuard', () => {
  let guard: PlatformScopeGuard;

  const buildContext = (user?: unknown): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: <T>() => ({ user }) as T,
      }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    guard = new PlatformScopeGuard();
  });

  it('should allow SUPER_ADMIN without a company', () => {
    const context = buildContext({
      sub: 'platform-user-1',
      email: 'platform@example.com',
      role: UserRole.SUPER_ADMIN,
      companyId: null,
    });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('should reject a request without an authenticated user', () => {
    const context = buildContext();

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('should reject SUPER_ADMIN with a companyId', () => {
    const context = buildContext({
      sub: 'platform-user-1',
      email: 'platform@example.com',
      role: UserRole.SUPER_ADMIN,
      companyId: 'company-1',
    });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it.each([
    UserRole.OWNER,
    UserRole.ADMIN,
    UserRole.ACCOUNTANT,
    UserRole.VIEWER,
  ])('should reject tenant role %s even without a company', (role) => {
    const context = buildContext({
      sub: 'tenant-user-1',
      email: 'tenant@example.com',
      role,
      companyId: null,
    });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('should reject a tenant role with a companyId', () => {
    const context = buildContext({
      sub: 'tenant-user-1',
      email: 'tenant@example.com',
      role: UserRole.OWNER,
      companyId: 'company-1',
    });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('should reject an unknown role without a company', () => {
    const context = buildContext({
      sub: 'user-1',
      email: 'unknown@example.com',
      role: 'UNKNOWN_ROLE',
      companyId: null,
    });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('should reject SUPER_ADMIN when companyId is missing', () => {
    const context = buildContext({
      sub: 'platform-user-1',
      email: 'platform@example.com',
      role: UserRole.SUPER_ADMIN,
    });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });
});
