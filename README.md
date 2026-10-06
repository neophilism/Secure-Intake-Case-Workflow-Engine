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

**PR 20 — end-to-end reference application / 1.0 release candidate**

This milestone adds the fictional Public Integrity Demonstration Office as a complete thin application built from the engine's portable manifest plus synthetic setup tooling. It exercises complaint intake, screening, assignment, investigation, information requests, supervisory decision, independent appeal, review effect, and closure without adding domain-specific runtime code to the engine.

The package version is **1.0.0-rc.1**.

See [examples/reference-app](examples/reference-app), [docs/development.md](docs/development.md), and [docs/architecture](docs/architecture).(docs/development.md) for local setup and [docs/architecture](docs/architecture) for architectural decisions.

## Security status

This repository is an open-source engine and is **not** an accredited system for classified information. Deployments handling sensitive information require additional controls, review, and authorization appropriate to their use.
