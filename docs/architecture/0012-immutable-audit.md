# ADR 0012: Immutable audit event system

## Status
Accepted for PR 9.

## Decision

The platform has one tenant-scoped append-only audit envelope in addition to feature-specific operational history tables.

Audit events contain:

- event ID
- organization
- occurrence timestamp
- actor type and optional actor user
- action
- resource type and resource ID
- optional parent resource
- correlation ID
- source
- bounded previous state
- bounded new state
- metadata

## Immutability

Application code exposes no update/delete audit service.

The database migration installs a PostgreSQL trigger that rejects every `UPDATE` or `DELETE` on `audit_events`.

This protects the log from accidental application mutation. Database superusers remain capable of administrative intervention; database-level infrastructure controls and backups remain necessary for full operational assurance.

## Atomicity

Where a domain mutation already uses a transaction, its audit event is inserted in the same transaction.

A failed audit insert therefore rolls back the associated state change rather than leaving a successful mutation without its corresponding audit record.

## Data minimization

Audit events do not duplicate sensitive payloads unnecessarily.

Do not place any of the following in audit state or metadata:

- passwords
- session or resume tokens
- document binary content
- malware samples
- full intake answers
- secrets or credentials

Events should instead record identifiers, statuses, hashes, version numbers, policy-relevant fields, and other bounded operational metadata.

## Correlation IDs

Every event has a UUID correlation ID.

A service may supply one correlation ID for multiple events caused by one logical operation. Otherwise the event builder generates one.

## Actor types

- `user`: authenticated user action
- `anonymous`: unauthenticated public action
- `system`: automatic or system-initiated action

## Relationship to feature histories

Existing tables such as case status history, assignment history, document custody history, and document access history remain useful domain records.

The immutable audit envelope does not replace them. It provides a uniform oversight stream across subsystems.

## Event naming

Actions use stable dotted tokens, for example:

- `submission.received`
- `case.created`
- `case.updated`
- `case.transitioned`
- `case.assigned`
- `case.routed`
- `case.escalated`
- `document.uploaded`
- `document.scan_recorded`
- `document.downloaded`
- `document.custody_recorded`
- `workflow.created`
- `workflow.version_created`
- `workflow.version_published`
- `workflow.bound_to_form`

## Read access

The admin audit viewer requires `audit:view`.

There is intentionally no UI for editing or deleting audit events.
