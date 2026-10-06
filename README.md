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

**PR 16 — API and webhooks**

This milestone adds scoped organization API clients, database-backed per-client rate limits, a versioned read API with OpenAPI 3.1 documentation, and durable signed webhooks fanned out from immutable audit events through the existing background-job engine.

API credentials are hashed at rest. Webhook signing secrets are AES-256-GCM encrypted, deliveries are HMAC-signed, redirects are disabled, and private/local webhook destinations are rejected at subscription creation and delivery.

See [docs/development.md](docs/development.md) for local setup and [docs/architecture](docs/architecture) for architectural decisions.

## Security status

This repository is an open-source engine and is **not** an accredited system for classified information. Deployments handling sensitive information require additional controls, review, and authorization appropriate to their use.
