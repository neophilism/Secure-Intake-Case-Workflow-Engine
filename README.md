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

**PR 21 — generic 1.0 release contract and integration testing**

This milestone completes the upstream engine as a domain-neutral release candidate. CI now boots an empty PostgreSQL database, runs every migration, applies a neutral thin-application manifest, and verifies intake, case creation, routing, deadlines, workflow transitions, independent review, closure, manifest idempotency, historical version pinning, and ownership-collision protection.

The package version is **1.0.0-rc.1**. Tagged releases publish a verified container image to GitHub Container Registry for use by separate downstream application repositories.

See [docs/development.md](docs/development.md), [docs/downstream-application-contract.md](docs/downstream-application-contract.md), and [docs/architecture](docs/architecture) for the release and downstream contracts.

## Security status

This repository is an open-source engine and is **not** an accredited system for classified information. Deployments handling sensitive information require additional controls, review, and authorization appropriate to their use.
