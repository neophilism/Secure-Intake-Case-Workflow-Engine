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

**PR 25 — secure public attachment pipeline**

This milestone enables explicitly configured public form file fields while preserving the engine's existing evidence-security boundary. Browser files are staged through the document storage adapter, hashed with SHA-256, bound to a manifest-declared document type, persisted as immutable submission-linked versions, and begin in `quarantined / pending` state.

A public upload is never trusted merely because the server accepted it. It becomes available evidence only after the document subsystem records a clean malware-scan result. Clean intake attachments are promoted to the case evidence set whether scanning completes before or after case creation; pending, failed, and infected content remains outside the trusted evidence surface.

The package version is **1.0.0-rc.5**.

See [docs/architecture/0027-public-attachment-pipeline.md](docs/architecture/0027-public-attachment-pipeline.md) and [docs/downstream-application-contract.md](docs/downstream-application-contract.md).

## Security status

This repository is an open-source engine and is **not** an accredited system for classified information. Deployments handling sensitive information require additional controls, review, and authorization appropriate to their use.
