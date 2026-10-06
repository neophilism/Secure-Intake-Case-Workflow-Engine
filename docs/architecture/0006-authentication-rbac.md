# ADR 0006: Authentication and organization-scoped RBAC

## Status
Accepted for PR 3.

## Decision

Authentication, tenancy, and authorization are distinct layers.

```text
identity -> authenticated user -> active membership -> tenant scope -> roles -> permissions
```

A valid login proves only the user's identity. It does not authorize access to an organization. Tenant scope is created only after the server verifies an active organization membership for the authenticated user.

## Sessions

The browser receives an opaque random session token. The database stores only a SHA-256 hash of that token. Sessions:

- have a fixed expiry;
- may be revoked server-side;
- optionally store the active organization;
- are invalid when the associated user is disabled;
- lose tenant access if the active organization membership is no longer active.

Session cookies are HTTP-only, SameSite=Lax, path-scoped to the application, and Secure in production.

## Identity providers

Local password credentials are supported for a usable baseline, but credentials are stored separately from the user record. External providers are represented by `auth_identities(provider, subject)`. Future OIDC/SAML/SSO adapters should resolve their authenticated subject to a user and then create the same ordinary server-side session.

No external provider may bypass the membership/RBAC layer.

## Passwords

Local passwords have a minimum length and are bcrypt-hashed. Authentication error responses do not distinguish unknown users from incorrect passwords.

Rate limiting, account recovery, MFA policy, and broader login-abuse defenses belong to later production-security milestones.

## Roles and permissions

Roles belong to exactly one organization. Role assignments belong to an organization membership. Permissions are explicit string capabilities such as:

- `office:view`
- `office:manage`
- `case:view`
- `case:update`
- `audit:view`

Repository and service methods still enforce tenant boundaries; RBAC is an additional control, not a substitute for tenant scoping.

Default roles are templates, not hard-coded branches in authorization logic. Downstream applications may add specialized roles and permission codes.

## Fail-closed rules

1. Missing or invalid session -> unauthenticated.
2. Missing active membership -> no tenant scope.
3. Missing permission -> denied.
4. A requested organization ID is never accepted as proof of membership.
5. Disabling a membership immediately prevents that membership from resolving tenant authority on the next request.
6. Cross-tenant role and membership assignments are rejected by organization-scoped service methods.
