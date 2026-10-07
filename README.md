# Secure Intake & Case Workflow Engine

Reusable open-source infrastructure for secure intake, case management, workflow routing, deadlines, review, and administrative due process.

## Design goals

- Statute-neutral core primitives
- Organization-scoped data and deny-by-default authorization
- Configurable intake, workflows, deadlines, reviews, and terminology
- Explicit public/private information boundaries
- Append-only audit history for material actions
- Stable REST/OpenAPI and event interfaces
- Thin downstream applications for legislation-specific workflows

## Current milestone

**PR 27 — application operations profiles and participant-safe contact**

This milestone lets downstream applications ship shared operational work views
and objective performance metrics through the application manifest. Named views
reuse the existing tenant-scoped case search engine; metrics currently support
view-based case counts and deadline-compliance reporting over case and referral
deadline policies.

The staff case view also derives participant portal messaging eligibility from
the same immutable form-version policy and submission answers used by the
participant portal. Staff cannot create or publish portal correspondence when a
submission is status-only or otherwise lacks participant messaging capability.

The package version is **1.0.0-rc.7**.

See
[docs/architecture/0029-application-operations-profiles.md](docs/architecture/0029-application-operations-profiles.md)
and [docs/downstream-application-contract.md](docs/downstream-application-contract.md).

## Security status

This repository is an open-source engine and is **not** an accredited system for classified information. Deployments handling sensitive information require additional controls, review, and authorization appropriate to their use.
