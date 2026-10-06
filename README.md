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

**PR 15 — search, queues, and operational dashboards**

This milestone adds tenant-scoped full-text case search, structured filters, derived operational work queues, personal saved views, exception counts, and queue/member workload dashboards over the existing authoritative case, deadline, review, assignment, and tag records.

The operational layer deliberately does not index restricted evidence, notes, correspondence, or disclosure content into the general case search surface.

See [docs/development.md](docs/development.md) for local setup and [docs/architecture](docs/architecture) for architectural decisions.

## Security status

This repository is an open-source engine and is **not** an accredited system for classified information. Deployments handling sensitive information require additional controls, review, and authorization appropriate to their use.
