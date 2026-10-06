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

**PR 10 — deadlines, statutory clocks, and escalation**

This milestone adds versioned workflow deadline policies, timezone-aware business-day calendars, concurrent case clocks, warnings, pause/resume, overdue evaluation, deadline history, supervisory dashboards, and configured escalation.

Clock creation/completion is transactional with the case event that triggers it. Time-dependent warnings/overdue states are evaluated through the reusable deadline sweep service.

See [docs/development.md](docs/development.md) for local setup and [docs/architecture](docs/architecture) for architectural decisions.

## Security status

This repository is an open-source engine and is **not** an accredited system for classified information. Deployments handling sensitive information require additional controls, review, and authorization appropriate to their use.
