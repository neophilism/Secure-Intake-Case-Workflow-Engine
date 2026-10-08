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

**PR 30 — immutable container release evidence**

The tagged container release workflow now emits a machine-readable
`release-evidence.json` artifact after the GHCR push.

The artifact binds the release's package version, Git tag, exact source commit,
container digest, and immutable `repository@sha256:digest` reference.

The existing release gates, provenance attestation, and SBOM remain unchanged.
Normal PR CI also exercises the evidence writer with synthetic inputs.

The runtime package version remains **1.0.0-rc.9**.

See
[docs/architecture/0032-immutable-container-release-evidence.md](docs/architecture/0032-immutable-container-release-evidence.md).

## Security status

This repository is an open-source engine and is **not** an accredited system for classified information. Deployments handling sensitive information require additional controls, review, and authorization appropriate to their use.
