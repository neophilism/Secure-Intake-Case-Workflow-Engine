# ADR 0028: Parallel case referrals and recipient-specific clocks

## Status

Accepted for PR 26.

## Context

A single case may need to be referred to more than one external recipient at
the same time. A case-wide workflow state is not sufficient for that model:
each recipient may acknowledge at a different time, return different interim
responses, require a separate extension, or become overdue independently.

Before this milestone, downstream applications could model one referral path
with case states and case-wide deadlines, but multiple concurrent recipients
would share the same policy key and clock.

## Decision

The engine introduces first-class, organization-scoped case referrals:

- `case_referral_policies` stores manifest-managed reusable policy;
- `case_referrals` stores one recipient-specific work item linked to a case;
- `case_referral_events` stores its append-only operational history;
- `case_deadlines.referral_id` scopes existing deadline records to one
  referral when applicable.

A referral snapshots its policy definition when created. Later manifest
changes therefore do not rewrite the obligations of an existing referral.

## Referral lifecycle

The generic lifecycle supports:

```text
draft
  -> sent
  -> acknowledged / active
  -> completed

draft/sent/acknowledged/active
  -> cancelled
```

Material events include:

- sent;
- acknowledged;
- preliminary response;
- status update;
- final response;
- completed;
- cancelled.

A preliminary, status, or final response is treated as implicit
acknowledgment when no separate acknowledgment has been recorded.

The event log records summaries and bounded structured details without
changing prior history.

## Referral deadline policy

A manifest may define referral policies separately from the case workflow:

```json
{
  "key": "external_referral",
  "name": "External referral",
  "definition": {
    "schemaVersion": 1,
    "deadlinePolicies": [
      {
        "key": "preliminary_response",
        "label": "Preliminary response",
        "trigger": "sent",
        "duration": {
          "value": 30,
          "unit": "calendar_days"
        },
        "completeOnEvents": [
          "preliminary_response",
          "final_response",
          "completed",
          "cancelled"
        ]
      }
    ]
  }
}
```

The same deadline-policy key may exist on many referrals in the same case.
Uniqueness is enforced per referral, not globally per case.

Case-level workflow deadlines remain separate and cannot be accidentally
completed by a referral event.

## Extensions

The generic deadline service now supports explicit, auditable extensions.
An extension records:

- the extension amount and unit;
- the reason;
- the previous due date;
- the new due date;
- referral linkage when applicable.

This is distinct from pause/resume. A pause represents time excluded under a
pausable policy; an extension represents an affirmative decision to move the
due date.

## Escalation

Referral deadlines reuse the existing warning and escalation machinery. Each
recipient therefore has an independently sweepable clock.

Escalation effects still apply to the parent case, such as raising priority or
routing the case to an oversight queue, while the deadline record and audit
trail identify the specific referral that became overdue.

## Access and audit

New core permissions are:

- `referral:view`;
- `referral:manage`.

Every referral lifecycle mutation and deadline mutation is audited. User
operations retain the staff user ID. API-originated referral operations use a
non-user audit actor with source `api` rather than falsely attributing the
operation to a staff user.

## Interfaces

The case detail page includes a referral panel with:

- referral creation;
- send/acknowledgment recording;
- preliminary, status, and final responses;
- completion/cancellation;
- referral deadlines;
- explicit deadline extensions;
- event history.

An organization-wide referral dashboard supports oversight across cases.

The REST API exposes referral listing, creation, detail, history, and lifecycle
operations under each case.

## Scope

This is a generic case-management primitive. It does not encode:

- any particular agency;
- a fixed list of external recipients;
- legislation-specific response periods;
- a specific referral document format;
- network delivery to the external recipient.

Downstream applications provide recipient choices, referral policy, statutory
or contractual time periods, and operational delivery integrations.
