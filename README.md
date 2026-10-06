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

**PR 12 — notifications and background jobs**

This milestone adds a durable PostgreSQL-backed job queue, expiring worker leases, retry/backoff and dead-letter handling, recurring deadline schedules, in-app notifications, user delivery preferences, provider-neutral email/webhook delivery jobs, correspondence delivery jobs, and operational job controls.

The bundled worker only claims job types it can actually execute. External-delivery jobs remain pending until a deployment registers the corresponding transport adapters.

See [docs/development.md](docs/development.md) for local setup and [docs/architecture](docs/architecture) for architectural decisions.

## Security status

This repository is an open-source engine and is **not** an accredited system for classified information. Deployments handling sensitive information require additional controls, review, and authorization appropriate to their use.
