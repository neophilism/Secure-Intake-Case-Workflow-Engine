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

**PR 26 — parallel case referrals and recipient-specific clocks**

This milestone adds a first-class referral ledger for cases that must be sent to multiple external recipients in parallel. Each referral snapshots its manifest-defined policy, records its own recipient and response history, and receives independent deadline instances for acknowledgment, interim response, final response, or other configured milestones.

Referral deadlines reuse the existing warning, pause/resume, escalation, and immutable audit machinery while remaining isolated from case-level workflow deadlines. The deadline service also gains explicit, reasoned extensions so an agreed extension moves only the selected clock and is preserved in deadline history.

Staff can operate referrals from the case page, oversight staff can use an organization-wide referral dashboard, and API clients can read/create/update referral work items without being misattributed to a staff user.

The package version is **1.0.0-rc.6**.

See [docs/architecture/0028-parallel-case-referrals.md](docs/architecture/0028-parallel-case-referrals.md) and [docs/downstream-application-contract.md](docs/downstream-application-contract.md).

## Security status

This repository is an open-source engine and is **not** an accredited system for classified information. Deployments handling sensitive information require additional controls, review, and authorization appropriate to their use.
