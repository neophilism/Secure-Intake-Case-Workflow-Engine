# ADR 0016: Review, reconsideration, and appeal domain

## Status
Accepted for PR 13.

## Decision

Administrative review is modeled as a distinct, append-oriented domain layered over a case.

The engine does not assign special legal meaning to words such as appeal or reconsideration. Downstream applications configure review policies and terminology appropriate to their authority.

## Review policies

An organization may configure review policies with:

- stable key and display name;
- hierarchy level;
- eligible current case states;
- optional filing window;
- optional decision deadline and warning;
- optional deadline calendar;
- allowed outcome keys;
- independent-reviewer requirement;
- zero or more prerequisite review policies.

A policy with no prerequisites challenges the current case decision.

A policy with prerequisites requires a decided parent review whose policy is one of those configured prerequisites.

Prerequisite policies must have a lower hierarchy level than the policy being created.

No default review policy is automatically installed.

## Immutable filing snapshot

Filing a review stores two immutable JSON snapshots.

### Policy snapshot

The filed policy snapshot contains:

- policy identity/name/level;
- eligible case states;
- filing timing;
- decision timing;
- calendar ID;
- allowed outcomes;
- reviewer-independence rule;
- prerequisite policy identities.

Later policy changes do not alter a pending or historical review.

### Challenged decision snapshot

For a first-level review, the snapshot captures the current case decision context and latest case status-history event.

For a higher-level review, the snapshot captures the decided parent review, including its outcome and written decision.

The original challenged record is not rewritten.

PostgreSQL enforces this filing boundary with a trigger that rejects updates to the filed policy snapshot, challenged-decision snapshot, grounds/requested relief, filer/time, calculated filing deadline, and calculated decision clock.

## Filing eligibility

The service validates:

- active policy;
- current case eligibility;
- prerequisite/parent-review relationship;
- same-tenant/same-case parent review;
- decided parent status;
- filing-window timeliness;
- absence of an already-open review under the same policy for the same challenged decision.

The calculated filing deadline is retained on the review record for later audit.

Partial unique indexes permit at most one open review for the same case, policy, and challenged root/parent review. This closes the race where two concurrent filing requests both pass application-level duplicate checks.

The legacy `case:appeal` permission remains accepted for filing compatibility; new configurations should prefer `review:file`.

## Reviewer independence

When a filed policy requires independence, the assigned reviewer cannot be:

- the filer; or
- the user who made the challenged case/review decision.

Reviewers must be active members of the same organization.

## Review lifecycle

The generic lifecycle is:

```text
filed -> assigned -> under_review -> decided
   \-> withdrawn
assigned/under_review -> withdrawn
```

A written decision is required before `decided`.

Outcome values come from the filed policy snapshot. The engine does not attach hidden behavior to a particular outcome key.

Implementation/remand instructions are optional structured decision text.

## Review deadlines

Decision timing begins at filing.

Review records retain:

- decision due timestamp;
- warning timestamp;
- warning-issued timestamp;
- overdue timestamp.

The core worker registers:

```text
review.sweep
```

The built-in recurring schedule `review-sweep` runs at the same configured cadence as the existing deadline sweep.

Warning/overdue mutations use conditional updates so concurrent workers cannot duplicate history or notifications.

Assigned reviewers receive in-app notifications when a review is assigned, approaching its deadline, or overdue.

## Applying a review decision to the case

A decided review does not automatically mutate the underlying case.

An authorized user may explicitly apply the review decision to a declared workflow state.

This operation:

- requires review decision authority and ordinary case-update authority at the UI boundary;
- validates that the target state exists in the case's snapshotted workflow;
- changes the case state;
- clears resolved/closed timestamps and reopens the case;
- records case status history referencing the review;
- records review history;
- emits immutable audit state;
- records the one-time case-effect timestamp/target on the review.

The operation does not rewrite or delete the challenged decision.

The engine deliberately does not infer which workflow deadlines should restart merely from an outcome label. Downstream configuration may define the appropriate post-review workflow/deadline behavior.

## History and audit

Review operational history is database-enforced append-only: update and delete triggers reject mutation of history rows.

Review operational history records:

- filed;
- assigned/reassigned;
- started;
- deadline warning;
- deadline overdue;
- decided;
- withdrawn;
- case effect applied.

Material operations also enter the immutable audit stream.

Audit events record status, outcome, IDs, lengths/flags, and timestamps; they do not duplicate full written decisions or filing grounds.

## Surfaces

Organization review policy and queue dashboard:

```text
/admin/reviews
```

Case-level review workflow:

```text
/admin/cases/<case-id>
```

Review events are also incorporated into the permission-gated unified case timeline.
