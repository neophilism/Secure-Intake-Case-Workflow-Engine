# ADR 0005: Organization tenancy and membership model

## Status
Accepted for PR 2.

## Decision

The engine uses organizations as the primary tenant boundary.

Every tenant-owned table carries an explicit `organization_id` even when that ownership could be inferred through another relationship. This keeps authorization predicates simple, auditable, and difficult to omit accidentally.

The initial hierarchy is:

```text
Organization
├── Offices (hierarchical)
├── Organization memberships
│   └── Office memberships
└── Invitations
```

Users exist globally and may hold memberships in more than one organization. A membership can be active or disabled without deleting the user.

## Trusted scope

Repositories that access tenant-owned data accept a server-side `TenantScope` and include the organization ID in their query predicates. Tenant scope is not accepted from untrusted request data as proof of authorization.

PR 3 will create trusted scopes from authenticated user memberships and permissions.

## Fail-closed rules

1. Tenant-owned queries include the active organization ID.
2. New tenant-owned records derive their organization ID from the trusted scope, not from payload data.
3. Cross-organization parent/relationship references are rejected at the service boundary.
4. Hierarchy builders reject mixed-tenant input rather than silently displaying it.
5. Public organization-management mutation endpoints are deferred until authentication exists.
