# ADR 0009: Configurable workflow and transition engine

## Status
Accepted for PR 6.

## Decision

Case lifecycle behavior is configuration, not hard-coded application logic.

A stable workflow owns immutable numbered workflow versions. Publishing a draft supersedes the previously published version. Intake forms may bind to a stable workflow. When a new case is created, the engine snapshots the currently published workflow definition into the case and records the workflow version ID.

The snapshot is the authoritative lifecycle definition for that case. Publishing a later workflow version therefore changes future cases only.

Existing cases created before PR 6 are backfilled with the PR 5 default lifecycle snapshot.

## Definition model

A workflow definition contains:

- schema version;
- initial state;
- named states;
- keyed transitions;
- required permissions;
- comment policy: optional, required, or forbidden;
- required case fields;
- required source-submission fields;
- required document types/counts;
- safe automatic actions.

Every transition must name at least one permission. No transition may target an undeclared state or transition from a state to itself.

## Transition execution

The server:

1. loads the tenant-scoped case;
2. parses the case's pinned workflow snapshot;
3. resolves the requested transition key from the current state;
4. evaluates permissions and guards;
5. applies safe automatic actions;
6. updates the case with an optimistic current-state predicate;
7. records transition history.

The client never decides whether a transition is authorized.

## Automatic actions

PR 6 intentionally allows only bounded case mutations:

- mark open;
- mark resolved;
- mark closed;
- set priority;
- set/clear disposition;
- add/remove normalized tags.

External side effects such as email, webhooks, routing, or third-party calls are not workflow actions yet. Those depend on later notification/job infrastructure.

## Document guards

Workflow definitions may already require document types and counts. Until the PR 8 document/evidence subsystem supplies trusted document context, those guards evaluate against an empty document set and fail closed.

## Form binding

A form may be bound only to a workflow that has a published version. Unbound forms use the built-in default workflow snapshot.

If a binding exists but its published workflow version is unavailable because of inconsistent data, case creation fails rather than silently falling back.

## Permissions

- `workflow:view` allows viewing workflow configuration.
- `workflow:manage` allows creating, versioning, publishing, and binding workflows.
- transition-specific permissions are defined inside each workflow transition and enforced server-side.

Existing tenants can synchronize newly introduced default-role permissions with `npm run auth:sync-roles`.
