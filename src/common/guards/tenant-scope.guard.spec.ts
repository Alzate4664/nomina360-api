import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { TenantScopeGuard } from './tenant-scope.guard';

describe('TenantScopeGuard', () => {
  let guard: TenantScopeGuard;

  const buildContext = (user?: unknown): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: <T>() => ({ user }) as T,
      }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    guard = new TenantScopeGuard();
  });

  it.each([
    UserRole.OWNER,
    UserRole.ADMIN,
    UserRole.ACCOUNTANT,
    UserRole.VIEWER,
  ])('should allow tenant role %s with a valid companyId', (role) => {
    const context = buildContext({
      sub: 'user-1',
      email: 'tenant@example.com',
      role,
      companyId: 'company-1',
    });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('should reject a request without an authenticated user', () => {
    const context = buildContext();

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('should reject SUPER_ADMIN without a company', () => {
    const context = buildContext({
      sub: 'platform-user-1',
      email: 'platform@example.com',
      role: UserRole.SUPER_ADMIN,
      companyId: null,
    });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('should reject SUPER_ADMIN even when it has a companyId', () => {
    const context = buildContext({
      sub: 'platform-user-1',
      email: 'platform@example.com',
      role: UserRole.SUPER_ADMIN,
      companyId: 'company-1',
    });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('should reject a tenant role without a companyId', () => {
    const context = buildContext({
      sub: 'user-1',
      email: 'tenant@example.com',
      role: UserRole.OWNER,
      companyId: null,
    });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('should reject a tenant role with a blank companyId', () => {
    const context = buildContext({
      sub: 'user-1',
      email: 'tenant@example.com',
      role: UserRole.OWNER,
      companyId: '   ',
    });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('should reject an unknown role', () => {
    const context = buildContext({
      sub: 'user-1',
      email: 'tenant@example.com',
      role: 'UNKNOWN_ROLE',
      companyId: 'company-1',
    });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });
});
