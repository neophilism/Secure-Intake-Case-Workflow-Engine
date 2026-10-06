# ADR 0010: Assignment, routing, and escalation

## Status
Accepted for PR 7.

## Decision

Organizational structure, staffing groups, work queues, and individual assignment are distinct concepts.

```text
organization
  -> office (organizational structure)
  -> team (staff group)
  -> queue (work bucket)
  -> case assignment (queue + optional organization membership)
```

Teams may optionally be associated with an office. Queues may optionally be associated with a team.

## Queue strategies

PR 7 supports:

- `manual`: routing assigns the queue but leaves the case unassigned to a worker;
- `round_robin`: routing assigns the queue and selects the next active, available team member.

Round-robin queues must have a team.

The cursor is stored per queue and advanced atomically in the database. Member selection is deterministic over the currently eligible membership set.

## Eligible assignees

Assignments point to `organization_memberships`, not bare users.

An automatically selected assignee must have:

1. an active organization membership in the tenant;
2. an active user account;
3. an active team membership marked available.

Manual assignment also verifies tenant membership and active user status. When a queue is linked to a team, a manually selected worker must be an available member of that team.

## Routing rules

Routing rules are ordered by ascending numeric priority. The first active matching rule wins.

Rule conditions may inspect:

- case type;
- priority;
- status;
- normalized tag membership;
- source-submission fields.

Rules may use `all` or `any` matching.

Routing targets queues rather than people. The queue strategy controls whether a worker is selected automatically.

## Case creation

Case creation and routing are deliberately separate transactions.

The case is created first. The routing engine then runs immediately. This guarantees that a routing configuration failure cannot destroy or roll back an otherwise valid intake-to-case conversion.

A routing failure is surfaced to staff and the durable case remains available for manual assignment.

## Manual reassignment

Users with `case:assign` may override queue and assignee. Manual changes remain subject to tenant and team eligibility checks.

Every manual change produces an assignment-history row.

## Assignment history

All assignment activity records:

- prior and new queue;
- prior and new assignee;
- source (`manual`, `routing`, or `escalation`);
- routing rule when applicable;
- actor when applicable;
- reason;
- metadata;
- timestamp.

This is domain history. PR 9 will add the platform-wide immutable audit envelope.

## Escalation

PR 7 supports explicit operational escalation.

Escalating a case:

- increments `escalation_level`;
- records timestamp and reason;
- may move the case to another queue;
- may raise or otherwise set priority;
- applies the destination queue's round-robin strategy when appropriate;
- records the action in assignment history.

Time-based automatic SLA escalation is intentionally deferred until background scheduling/job infrastructure is available. The PR 7 data model is designed so a scheduler can call the same escalation service later.

## Permissions

- `routing:view`: inspect teams, queues, rules, and routing configuration.
- `routing:manage`: configure teams, availability, queues, and routing rules.
- `case:assign`: manually assign, reroute, or escalate cases.

Default-role changes for an existing installation can be synchronized with:

```bash
npm run auth:sync-roles
```
