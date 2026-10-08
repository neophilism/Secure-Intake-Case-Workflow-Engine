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

**PR 29 — liveness and readiness contracts**

Cloud deployments now have explicit machine-readable service health endpoints.

- `GET /api/health` is a process-level liveness signal and reports the actual
  package version.
- `GET /api/ready` performs a minimal PostgreSQL probe and returns HTTP 503
  when the database is unconfigured or unavailable.

Neither endpoint exposes credentials, raw database errors, tenant data, or
protected content.

The package version is **1.0.0-rc.9**.

See
[docs/architecture/0031-liveness-readiness-contracts.md](docs/architecture/0031-liveness-readiness-contracts.md).

## Security status

This repository is an open-source engine and is **not** an accredited system for classified information. Deployments handling sensitive information require additional controls, review, and authorization appropriate to their use.
