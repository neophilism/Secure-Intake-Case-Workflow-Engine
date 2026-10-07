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

**PR 28 — durable object storage and automatic malware scanning**

This milestone closes two deployment gaps in the generic document subsystem.

The engine can now store document bytes in an S3-compatible private object
store rather than requiring a shared local filesystem. It also supports a
generic HTTPS malware-scanner adapter and automatically enqueues a
`document.scan` background job for every newly persisted document version.

The trust boundary remains fail-closed: missing scanner configuration,
transient scanner/storage failure, a final failed result, or a SHA-256 mismatch
never marks a document clean. Only an explicit clean result makes content
available.

The package version is **1.0.0-rc.8**.

See
[docs/architecture/0030-durable-object-storage-and-automatic-scanning.md](docs/architecture/0030-durable-object-storage-and-automatic-scanning.md)
and [docs/downstream-application-contract.md](docs/downstream-application-contract.md).

## Security status

This repository is an open-source engine and is **not** an accredited system for classified information. Deployments handling sensitive information require additional controls, review, and authorization appropriate to their use.
