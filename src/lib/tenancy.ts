import type { EntityId } from "./contracts";

export interface TenantScope {
  readonly organizationId: EntityId;
}

export interface OrganizationOwned {
  readonly organizationId: EntityId;
}

export class TenantBoundaryError extends Error {
  constructor() {
    super("Resource is outside the active organization boundary.");
    this.name = "TenantBoundaryError";
  }
}

/**
 * Creates an organization scope from an already trusted server-side identity.
 * PR 3 will bind this to authenticated memberships. Never build this directly
 * from a client-supplied organization ID at an HTTP boundary.
 */
export function createTrustedTenantScope(organizationId: EntityId): TenantScope {
  if (!organizationId.trim()) {
    throw new Error("organizationId is required");
  }

  return Object.freeze({ organizationId });
}

export function assertTenantOwnership<T extends OrganizationOwned>(
  scope: TenantScope,
  resource: T,
): T {
  if (resource.organizationId !== scope.organizationId) {
    throw new TenantBoundaryError();
  }

  return resource;
}

export function selectTenantOwned<T extends OrganizationOwned>(
  scope: TenantScope,
  resources: readonly T[],
): T[] {
  return resources.filter(
    (resource) => resource.organizationId === scope.organizationId,
  );
}
