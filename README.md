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

**PR 11 — notes, correspondence, and communication**

This milestone adds visibility-scoped case notes, threaded inbound/outbound correspondence, deterministic templates, document-version attachments, provider-neutral delivery adapters, manual delivery recording, inbound reply linkage, delivery queue visibility, and a unified case timeline.

Internal communication access is permission-separated from ordinary case access, and externally visible communications cannot expose internal/restricted document versions.

See [docs/development.md](docs/development.md) for local setup and [docs/architecture](docs/architecture) for architectural decisions.

## Security status

This repository is an open-source engine and is **not** an accredited system for classified information. Deployments handling sensitive information require additional controls, review, and authorization appropriate to their use.
