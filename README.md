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

**PR 18 — security hardening**

This milestone hardens authentication, browser/session boundaries, integration responses, webhook egress validation, dependency checks, and the production container. It adds database-backed login throttling with enumeration-resistant bcrypt work, strict session cookies, same-origin guards for cookie-authenticated POST routes, baseline security headers, non-cacheable authenticated responses, stronger IPv4/IPv6 SSRF filtering, a non-root runtime image, and a high-severity production dependency audit gate.

See [docs/development.md](docs/development.md) for local setup and [docs/architecture](docs/architecture) for architectural decisions.

## Security status

This repository is an open-source engine and is **not** an accredited system for classified information. Deployments handling sensitive information require additional controls, review, and authorization appropriate to their use.
