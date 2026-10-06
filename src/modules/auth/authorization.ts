import type { TenantScope } from "@/lib/tenancy";
import type { Permission } from "./permissions";

export class AuthenticationRequiredError extends Error {
  constructor() {
    super("Authentication is required.");
    this.name = "AuthenticationRequiredError";
  }
}

export class OrganizationSelectionRequiredError extends Error {
  constructor() {
    super("An active organization must be selected.");
    this.name = "OrganizationSelectionRequiredError";
  }
}

export class PermissionDeniedError extends Error {
  readonly permission: Permission;

  constructor(permission: Permission) {
    super(`Permission denied: ${permission}`);
    this.name = "PermissionDeniedError";
    this.permission = permission;
  }
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  displayName: string | null;
}

export interface ActiveMembership {
  id: string;
  organizationId: string;
  title: string | null;
}

export interface AuthorizationContext {
  sessionId: string;
  user: AuthenticatedUser;
  membership: ActiveMembership | null;
  tenantScope: TenantScope | null;
  permissions: ReadonlySet<string>;
  roleKeys: readonly string[];
}

export function hasPermission(
  context: AuthorizationContext,
  permission: Permission,
): boolean {
  return context.permissions.has(permission);
}

export function requirePermission(
  context: AuthorizationContext,
  permission: Permission,
): void {
  if (!context.tenantScope || !context.membership) {
    throw new OrganizationSelectionRequiredError();
  }

  if (!hasPermission(context, permission)) {
    throw new PermissionDeniedError(permission);
  }
}

export function requireTenantScope(
  context: AuthorizationContext,
): TenantScope {
  if (!context.tenantScope || !context.membership) {
    throw new OrganizationSelectionRequiredError();
  }

  return context.tenantScope;
}
