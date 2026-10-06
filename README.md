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

**PR 13 — review, reconsideration, and appeals**

This milestone adds configurable review hierarchies, filing-window enforcement, immutable challenged-decision and policy snapshots, independent reviewer assignment, written decisions and configurable outcomes, review decision clocks, withdrawal, explicit remand/reopen-style case effects, review notifications, organization-wide review operations, and review history in the unified case timeline.

The engine deliberately does not assign hidden semantics to labels such as appeal, reconsideration, or remand; downstream applications define their lawful hierarchy, outcomes, and terminology.

See [docs/development.md](docs/development.md) for local setup and [docs/architecture](docs/architecture) for architectural decisions.

## Security status

This repository is an open-source engine and is **not** an accredited system for classified information. Deployments handling sensitive information require additional controls, review, and authorization appropriate to their use.
