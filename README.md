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

**PR 17 — configuration and white-label application layer**

This milestone adds declarative, versioned application manifests that let downstream bill-specific projects configure branding, terminology, roles, document types, calendars, routing, communications, workflows, intake forms, review policies, and other portable policy resources without changing the reusable engine.

Manifest application is idempotent and non-destructive. The engine explicitly tracks which resources a manifest owns and refuses to silently take over unrelated local configuration.

See [docs/development.md](docs/development.md) for local setup and [docs/architecture](docs/architecture) for architectural decisions.

## Security status

This repository is an open-source engine and is **not** an accredited system for classified information. Deployments handling sensitive information require additional controls, review, and authorization appropriate to their use.
