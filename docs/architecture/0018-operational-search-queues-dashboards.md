# ADR 0018: Operational search, queues, and dashboards

## Status

Accepted for PR 15.

## Decision

Operational search is a tenant-scoped read model over existing case, assignment, deadline, review, tag, queue, and membership records. The engine does not copy case content into a second application-level search index.

## Search

Case full-text search covers case number, title, summary, and case type. Tags are searched separately. PostgreSQL provides the full-text index and staff queries use `websearch_to_tsquery`.

Structured filters support status, priority, queue, assignee, tags, operational focus, sort order, and a bounded result limit.

## Operational focus queues

The engine exposes derived work queues for:

- assigned to me;
- unassigned;
- overdue;
- escalated;
- open review;
- recently closed.

These are queries over authoritative records. They do not create a second queue-assignment state machine and do not modify the routing queues introduced in PR 7.

## Dashboard

The operations dashboard reports open case counts, operational exceptions, queue workload, and member workload.

A case is considered open for workload purposes when `closed_at` is null. This avoids hard-coding downstream workflow status names.

Overdue and review indicators are derived from the deadline and review subsystems rather than duplicated onto the case.

## Saved views

Saved views are personal to the active organization membership. Each saved view stores only a bounded search definition, never search results or case content.

A membership can have at most one default view. Definitions are validated when saved and again when loaded.

## Security

Every operational query begins with the active tenant scope and requires `case:view`.

Queue and assignee IDs supplied in query parameters only narrow already-authorized data. They never establish authority.

Restricted document, note, correspondence, review-decision, and disclosure text is deliberately excluded from case full-text search.

PR 16 may expose equivalent capabilities through authenticated APIs. PR 15 keeps the new capabilities inside the staff web application.
