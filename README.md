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

**PR 34 — immutable release-request automation**

A reviewed change to `release-request.json` on `main` can now dispatch the
validated release workflow automatically.

The request must name the package version and an immutable 40-character source
commit SHA. Moving refs such as `main` are rejected.

The dispatcher has only Actions-write and repository-read permission; the
existing validated release workflow remains the sole authority for release
tests, tag creation, GHCR publication, provenance/SBOM and release evidence.

This makes releases triggerable through the same reviewed Git/PR path used for
source changes without introducing a personal access token.

PR 34 also includes the reviewed rc.9 release request pinned to source commit
`2fb452f23e5e5464db03a3ec95d36c4bc2db4fa4`. When this PR is merged to
`main`, the push matches the release-request workflow and dispatches the
validated rc.9 release automatically.

The runtime package version remains **1.0.0-rc.9**.

See
[docs/architecture/0034-immutable-release-request-dispatch.md](docs/architecture/0034-immutable-release-request-dispatch.md).

## Security status

This repository is an open-source engine and is **not** an accredited system for classified information. Deployments handling sensitive information require additional controls, review, and authorization appropriate to their use.
