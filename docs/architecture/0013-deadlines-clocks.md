# ADR 0013: Deadlines, statutory clocks, and escalation

## Status
Accepted for PR 10.

## Decision

Deadline policy is part of the versioned workflow definition.

A case therefore inherits the clock rules that were published with its workflow snapshot. Later workflow edits do not silently alter already-instantiated clocks.

## Policy model

A deadline policy defines:

- stable key and label;
- trigger: case creation or a named workflow transition;
- duration: hours, calendar days, or business days;
- optional warning offset;
- optional business-day calendar key;
- whether manual pause/resume is permitted;
- transitions that complete the clock;
- optional overdue escalation priority and/or queue slug.

Multiple policies may be active on one case at the same time.

Repeated workflow cycles may create later occurrences of the same policy after the prior occurrence is completed or cancelled.

## Business-day calendars

Business-day meaning is explicit and organization-scoped.

A calendar defines:

- stable key;
- IANA timezone;
- weekend weekdays;
- explicit excluded local dates such as holidays or closures.

The engine does not assume a federal, state, court, or agency holiday calendar.

If a workflow policy uses business days and its configured calendar cannot be resolved, the triggering case operation fails and its transaction rolls back.

## Calendar-day semantics

Calendar-day duration preserves local wall-clock time when a calendar timezone is available. Policies that do not require a calendar use UTC.

Hours are elapsed hours.

Business-day duration advances across local calendar dates while skipping configured weekend days and exclusions.

## Pause/resume

A policy must explicitly allow pausing.

Pause and resume both require reasons and are retained in deadline history and immutable audit.

For business-day clocks, pause extension counts only elapsed time occurring on configured business dates. Weekend/holiday time does not inflate the extension.

## Workflow integration

Case creation and transition-triggered deadline operations occur in the same transaction as the case mutation.

A transition may both complete existing policies and start new policies. Completion happens first, allowing a later occurrence of the same policy to begin during a recurring workflow.

## Warning and overdue evaluation

Warnings and overdue states are time-dependent and must be evaluated by a sweep.

PR 10 provides:

```bash
npm run deadline:sweep
```

and a protected manual sweep control at `/admin/deadlines`.

The command processes every active organization.

PR 10 does not ship a permanently running scheduler. PR 12 background-job infrastructure can invoke the same sweep service on a recurring schedule.

## Escalation

When an overdue deadline has an escalation policy, the sweep can use the existing case escalation service to:

- change case priority;
- move to a configured queue;
- apply that queue's round-robin assignment behavior;
- increment case escalation level;
- write assignment history and immutable audit.

Escalation queue policies use stable queue slugs rather than database IDs.

Failures remain visible on the deadline record and can be retried on a later sweep.

## Permissions

- `deadline:view`: inspect clocks and the deadline dashboard.
- `deadline:operate`: pause, resume, complete, or cancel a case clock.
- `deadline:manage`: configure calendars and run a supervisory sweep.

## Histories

Deadline-specific history records start, warning, overdue, pause, resume, completion, cancellation, and applied escalation events.

The platform immutable audit envelope records the corresponding material events as well.
