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

**PR 33 — one-click validated release dispatch**

The container release workflow can now be started manually from GitHub Actions
with a package version and source ref.

The manual path runs the same audit, migration, typecheck, release-contract,
accessibility, unit, integration and production-build gates as a tag-triggered
release. Only after those validations succeed does it create the annotated tag
(if needed), publish the GHCR image, emit provenance/SBOM, and upload immutable
`release-evidence.json` both as a 90-day Actions artifact and as a stable
GitHub Release asset for downstream promotion.

Retries are allowed only when an existing release tag already resolves to the
same source commit; the workflow refuses to move a release tag.

The runtime package version remains **1.0.0-rc.9**.

See
[docs/architecture/0033-one-click-validated-release-dispatch.md](docs/architecture/0033-one-click-validated-release-dispatch.md).

## Security status

This repository is an open-source engine and is **not** an accredited system for classified information. Deployments handling sensitive information require additional controls, review, and authorization appropriate to their use.
