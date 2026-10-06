# ADR 0001: Platform boundaries

## Status
Accepted for PR 1.

## Decision
The core engine is statute-neutral and organization-neutral. Legislative concepts such as claimant, whistleblower, inspector general, mediation board, agency, petition, or complaint are downstream configuration unless they are truly generic domain primitives.

The initial reusable primitives are:

- User
- Organization
- Role / Permission
- Actor
- Resource
- Document
- AuditEvent
- Notification

Cases, forms, workflows, deadlines, reviews, and evidence are introduced in later milestones as generic capabilities.

## Consequence
Bill-specific repositories should depend on the engine through configuration and versioned interfaces rather than modifying the core for one statute.
