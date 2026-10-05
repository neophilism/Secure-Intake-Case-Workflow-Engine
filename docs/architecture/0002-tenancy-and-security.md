# ADR 0002: Tenant isolation and security baseline

## Status
Accepted for PR 1.

## Decision
Every tenant-owned domain record must be attributable to an organization. Authorization is deny-by-default and must be enforced server-side. Public/private visibility is modeled explicitly rather than inferred from UI placement.

Sensitive systems built on this engine require separate deployment hardening and accreditation appropriate to their information class. The open-source engine must not claim authorization for classified information.

## Required invariants
1. Cross-organization access is prohibited unless an explicit future federation feature authorizes it.
2. Permission checks happen at the service/API boundary.
3. Audit-relevant changes emit immutable events.
4. Secrets do not enter source control.
