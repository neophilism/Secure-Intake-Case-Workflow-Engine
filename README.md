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

**PR 24 — conditional participant messaging**

This milestone extends the external participant portal so a form can enable protected status access for all submitters while making secure messaging conditional on an ordinary submitted field. The condition is evaluated from the immutable form-version snapshot plus ordinary persisted answers; protected fields cannot control participant messaging.

This also corrects the rc.3 status-only contract: when messaging is disabled for a participant, the portal can neither send nor read portal correspondence.

The package version is **1.0.0-rc.4**.

## Security status

This repository is an open-source engine and is **not** an accredited system for classified information. Deployments handling sensitive information require additional controls, review, and authorization appropriate to their use.
