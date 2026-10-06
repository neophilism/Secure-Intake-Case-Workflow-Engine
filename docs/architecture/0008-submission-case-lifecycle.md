# ADR 0008: Submission-to-case lifecycle

## Status
Accepted for PR 5.

## Decision

A submitted intake record and an administrative case are distinct resources.

The intake submission preserves what the submitter sent, including the exact form version used. Staff may then create one case from that submission. The database enforces at most one case per source submission.

This separation allows future applications to retain rejected or screened-out intake without rewriting the submitted record.

## Default lifecycle

PR 5 introduces a deliberately small default state machine:

```text
intake_review
  -> accepted
  -> rejected

accepted
  -> open
  -> intake_review

rejected
  -> intake_review

open
  -> resolved
  -> closed

resolved
  -> open
  -> closed

closed
  -> open
```

The model is intentionally generic. It is not a statutory workflow definition.

PR 6 will replace the hard-coded transition map with configurable workflow definitions, transition guards, required permissions, required fields/documents, and automatic actions. PR 5 exists to establish case persistence and prove the complete lifecycle before adding that abstraction.

## Case numbering

Each organization receives an independent yearly sequence. The default display format is:

```text
YYYY-000001
```

Sequence allocation, case creation, and the initial history entry occur in one database transaction. Concurrent allocation uses an atomic upsert on the organization/year sequence.

The default formatter is presentation policy and may later become application configuration; the underlying case UUID remains the durable system identifier.

## Source linkage

Creating a case from intake requires:

1. the source submission belongs to the active tenant;
2. the source status is `submitted`; and
3. no case already references that submission.

The created case starts in `intake_review`. Its default case type is the stable intake-form slug, and its default title references the source form and confirmation code.

## History

Every case creation and status transition receives a dedicated status-history row containing:

- organization;
- case;
- previous status;
- new status;
- acting user when available;
- transition note;
- timestamp.

This is domain history, not the final platform-wide immutable audit system. PR 9 will introduce the broader audit-event envelope and may emit/project these domain actions into it.

## Metadata

Cases support:

- title;
- summary;
- priority (`low`, `normal`, `high`, `critical`);
- disposition;
- normalized tags;
- open/resolved/closed timestamps.

Assignment, teams, queues, routing, reassignment history, and escalation are intentionally deferred to PR 7.

## Concurrency

Status updates include the previously read status in the update predicate. If another actor changes the case before the update commits, the operation fails rather than silently overwriting the newer state.

## Authorization

- `case:view` is required to view staff case screens.
- `case:create` plus `submission:view` is required to convert intake into a case.
- ordinary status transitions require `case:update`.
- transitions to `closed` require `case:close`.
- source intake answers are rendered only when the viewer also has `submission:view`.

Tenant scoping remains mandatory in addition to RBAC.
