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

**PR 22 — protected form compartments and dual-control reveal**

This milestone adds a domain-neutral privacy primitive discovered by the first real downstream application. Form fields may opt into an encrypted protected compartment. Protected values are removed from ordinary submission JSON before persistence—including resumable drafts—and are stored separately using AES-256-GCM with tenant/submission/compartment authenticated context.

Authorized staff can see only protected-compartment metadata. Plaintext requires an explicit access request, approval by a different authorized user, and a one-time reveal by the original requester. Reveal approvals expire after 15 minutes and every request, decision, and reveal is recorded in the immutable audit stream without copying plaintext into audit metadata.

The package version is **1.0.0-rc.2**.

See [docs/development.md](docs/development.md), [docs/downstream-application-contract.md](docs/downstream-application-contract.md), and [docs/architecture/0024-protected-compartments.md](docs/architecture/0024-protected-compartments.md).

## Security status

This repository is an open-source engine and is **not** an accredited system for classified information. Deployments handling sensitive information require additional controls, review, and authorization appropriate to their use.
