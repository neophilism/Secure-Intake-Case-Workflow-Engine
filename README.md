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

**PR 14 — public/private data separation and redaction**

This milestone centralizes PUBLIC / PARTICIPANT / INTERNAL / RESTRICTED classification, adds immutable disclosure publication revisions, independent disclosure review, explicit publication/withdrawal, provenance-linked redacted document derivatives, and anonymous public routes that read only from approved publication records.

Public classification alone never exposes a source record. Anonymous users can see only a separately reviewed and published public-safe representation and explicitly linked scan-clean public derivatives.

See [docs/development.md](docs/development.md) for local setup and [docs/architecture](docs/architecture) for architectural decisions.

## Security status

This repository is an open-source engine and is **not** an accredited system for classified information. Deployments handling sensitive information require additional controls, review, and authorization appropriate to their use.
