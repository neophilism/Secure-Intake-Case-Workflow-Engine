# ADR 0004: Audit event contract

## Status
Accepted for PR 1.

## Decision
Material actions use an append-only event envelope with:
- event ID
- occurrence time
- actor
- action
- resource
- organization context
- correlation ID when available
- structured metadata

Application state may remain mutable, but audit history is not edited through ordinary domain operations.

Later PRs will persist this contract and define event taxonomies for cases, documents, deadlines, messages, reviews, and administrative changes.
