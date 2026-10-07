import { UserRole } from '@prisma/client';

export const TENANT_USER_ROLES = [
  UserRole.OWNER,
  UserRole.ADMIN,
  UserRole.ACCOUNTANT,
  UserRole.VIEWER,
] as const;

export const PLATFORM_USER_ROLES = [UserRole.SUPER_ADMIN] as const;

export type TenantUserRole = (typeof TENANT_USER_ROLES)[number];
export type PlatformUserRole = (typeof PLATFORM_USER_ROLES)[number];

interface AuthenticatedIdentityBase {
  sub: string;
  email: string;
}

export interface AuthenticatedTenantUser extends AuthenticatedIdentityBase {
  role: TenantUserRole;
  companyId: string;
}

export interface AuthenticatedPlatformUser extends AuthenticatedIdentityBase {
  role: PlatformUserRole;
  companyId: null;
}

export type AuthenticatedIdentity =
  | AuthenticatedTenantUser
  | AuthenticatedPlatformUser;

/**
 * Backward-compatible alias for the current tenant controllers.
 *
 * Existing business controllers are tenant-scoped and therefore continue
 * using a non-null companyId. New platform-scoped endpoints must use
 * AuthenticatedPlatformUser explicitly.
 */
export type AuthenticatedUser = AuthenticatedTenantUser;
