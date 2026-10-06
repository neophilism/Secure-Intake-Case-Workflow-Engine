# ADR 0023: Generic 1.0 release and downstream repository boundary

## Status

Accepted for PR 21.

## Decision

The master repository remains completely domain-neutral.

The 1.0 release candidate is validated with neutral fixtures and a
database-backed integration contract rather than a bundled reference
application.

Specific implementations must live in separate repositories.

## Neutral integration contract

CI starts an empty PostgreSQL 16 database and runs every ordered migration from
zero.

It then exercises a deliberately meaningless fixture:

```text
example_form
-> state_a
-> state_b
-> state_c
-> independent review
-> state_d
-> state_closed
```

The fixture exists only to exercise generic primitives.

The integration contract verifies:

- migration bootstrap from an empty database;
- application-manifest reconciliation;
- identical-manifest idempotency;
- public intake and immutable form-version reference;
- case creation and immutable workflow-version reference;
- rule-based round-robin routing;
- deadline creation and completion;
- workflow transitions;
- independent review assignment and decision;
- explicit review effect on the workflow;
- final closure;
- form/workflow version increments after a changed manifest;
- historical submission/case version pinning;
- refusal to take ownership of an unmanaged resource collision.

No statutory, governmental, enforcement, surveillance, whistleblower,
declassification, or other application-domain concepts are required by this
test.

## Downstream boundary

The engine repository must not contain a Public Integrity application, National
Secure Ideas application, Goldwater application, or any other specific
implementation.

Those applications consume released engine artifacts from their own
repositories.

Neutral fixtures may use names such as:

```text
Example Application
example_form
example_workflow
state_a
example_queue
example_review
```

because those names communicate no substantive policy.

## Distribution

The supported release artifact is a versioned OCI container published to:

```text
ghcr.io/neophilism/secure-intake-case-workflow-engine
```

Release workflow tags must match the package version.

Release candidates retain prerelease tags such as:

```text
1.0.0-rc.1
```

Only stable versions receive the moving `latest` tag.

Downstream applications should pin an explicit version or immutable digest.

## Compatibility

The 1.0 contract includes:

- manifest `schemaVersion: 1`;
- ordered database migrations;
- preservation of historical form/workflow versions;
- stable resource ownership semantics;
- stable versioned REST API namespace;
- explicit engine release tags.

A future incompatible manifest or API contract requires explicit versioning
rather than silent reinterpretation.

## Rollback of prior reference application

PR 20 was merged and remains visible in Git history.

A later rollback commit restored the exact PR 19 file tree. PR 21 begins from
that restored tree.

PR 21 also removes the older Public Integrity example manifest that predated PR
20 and replaces it with the neutral fixture. This ensures the final 1.0 engine
tree is domain-neutral even where earlier milestones used a domain-flavored
example.
