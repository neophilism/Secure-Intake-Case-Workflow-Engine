# ADR 0029: Application-defined operational views and performance metrics

## Status

Accepted for PR 27.

## Context

The engine already supports tenant-scoped case search, personal saved views,
queue/member workload, deadline tracking, correspondence, and operational
exception dashboards.

A downstream application still needs a portable way to ship shared staff views
and objective performance measures. Requiring every operator to rebuild the
same filters by hand is error-prone, while hard-coding one application's
dashboard names or statutory deadlines into the generic engine would break the
engine's reusable boundary.

Conditional participant messaging also creates an operational safety issue:
staff need to know whether a case's immutable intake policy permits portal
messaging before preparing or publishing participant-visible portal
correspondence.

## Decision

The application manifest may define:

- shared operational views;
- operational performance metrics.

They are stored on the versioned application profile rather than in a second
mutable dashboard subsystem.

### Shared views

An application operational view may configure:

- case statuses;
- priorities;
- routing queue slugs;
- tags;
- a generic operational focus;
- sort order;
- result limit.

Queue slugs are resolved to tenant-local queue IDs at render time. The manifest
validator rejects undeclared queue slugs.

Application views cannot use the personal `mine` focus or membership IDs.
Those remain user-specific saved-view concepts.

### Metrics

PR 27 supports two objective metric types.

#### Case count

A case-count metric references one application operational view and reports the
current count matching that view.

#### Deadline compliance

A deadline-compliance metric declares:

- one or more deadline policy keys;
- whether the metric covers case deadlines, referral deadlines, or both;
- a bounded reporting window.

For deadlines due inside the window, the metric reports:

- completed on time;
- completed late;
- open overdue;
- assessed total;
- on-time compliance percentage.

Cancelled deadlines and currently paused deadlines are not counted as misses.

The metric uses authoritative deadline rows and timestamps. It does not invent
a subjective quality or success score.

## Participant messaging capability

The engine derives staff-visible portal messaging capability from the same
immutable form-version definition and ordinary submission-answer snapshot used
by the participant portal itself.

The capability also requires an active participant credential.

Staff case pages show one of:

- messaging available;
- portal enabled but status-only for this submission;
- portal unavailable.

When portal messaging is not allowed, staff cannot create or publish outbound
portal correspondence through the case-admin action. Portal templates and the
portal channel are hidden from the compose control.

This does not expose protected identity and does not decrypt protected
compartments.

## Security

Application operational configuration is read-only to ordinary staff and is
versioned with the active application manifest.

Metrics are aggregate reads over tenant-scoped authoritative records.

Participant contact eligibility is determined from immutable intake policy and
ordinary answers. It is not inferred from identity data.

## Scope

This milestone does not add:

- arbitrary SQL/report definitions;
- programmable metric expressions;
- cross-tenant analytics;
- a business-intelligence warehouse;
- outbound provider integrations;
- identity-verification provider calls.

Downstream applications map their own operational goals onto the generic view
and metric primitives.
