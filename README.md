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

**PR 3 — authentication and role-based access control**

This milestone adds opaque server-side sessions, local credential authentication, provider-neutral identity records, organization-scoped roles and permissions, default role templates, trusted authorization contexts, login/logout, organization selection, and protected organization administration.

Authentication proves user identity. Active membership selects tenant scope. Roles assigned inside that membership grant permissions. A client-supplied organization ID never creates authority.

See [docs/development.md](docs/development.md) for local setup and [docs/architecture](docs/architecture) for architectural decisions.

## Security status

This repository is an open-source engine and is **not** an accredited system for classified information. Deployments handling sensitive information require additional controls, review, and authorization appropriate to their use.
