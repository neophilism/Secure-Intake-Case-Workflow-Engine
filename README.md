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

**PR 23 — protected external-participant portal**

This milestone adds a domain-neutral external-participant access channel for public intake applications that need secure status lookup and two-way portal messaging without creating a staff/user account.

A form opts in with `participantPortal.enabled`. Final submission then issues a two-part credential: the existing non-secret confirmation/tracking code plus a separate 256-bit access secret. Only a SHA-256 hash of the access secret is stored. The raw secret is returned only in the immediate form submission result and is never placed in a URL, audit event, or database column.

Successful portal authentication exchanges the tracking code + secret for an expiring HttpOnly, SameSite=Strict browser session. Participant pages expose only bounded status metadata and participant/public portal correspondence. Internal case data, notes, submission answers, assignments, deadlines, and protected compartments remain outside the participant surface.

Portal correspondence reuses the existing case communication subsystem. Publishing a `portal` outbound message marks it sent directly through the internal participant-portal provider instead of creating an external delivery job. Participant replies are stored as inbound participant-visible portal correspondence and enter the immutable audit history without duplicating message bodies into audit metadata.

The package version is **1.0.0-rc.3**.

See [docs/development.md](docs/development.md), [docs/downstream-application-contract.md](docs/downstream-application-contract.md), and [docs/architecture/0025-external-participant-portal.md](docs/architecture/0025-external-participant-portal.md).

## Security status

This repository is an open-source engine and is **not** an accredited system for classified information. Deployments handling sensitive information require additional controls, review, and authorization appropriate to their use.
