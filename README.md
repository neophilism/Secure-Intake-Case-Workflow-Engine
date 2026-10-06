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

**PR 19 — accessibility, usability, and public-sector quality**

This milestone adds an accessible responsive presentation baseline, skip navigation and visible keyboard focus, structured form validation with field-linked error summaries, plain-language public intake copy, responsive tables, printable case summaries, reduced-motion support, and an Axe-based WCAG A/AA regression gate in CI.

See [docs/development.md](docs/development.md) for local setup and [docs/architecture](docs/architecture) for architectural decisions.

## Security status

This repository is an open-source engine and is **not** an accredited system for classified information. Deployments handling sensitive information require additional controls, review, and authorization appropriate to their use.
