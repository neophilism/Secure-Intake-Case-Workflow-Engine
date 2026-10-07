# ADR 0026: Conditional external-participant messaging

## Status

Accepted for PR 24.

## Context

A downstream application needed every public submitter to receive protected
status access while only some submissions were eligible for two-way secure
messaging.

The existing participant portal used one form-wide `allowMessaging` boolean.
That forced a downstream application to choose between:

- messaging for every participant; or
- status-only access for every participant.

That is too coarse when messaging eligibility is ordinary application policy.

The rc.3 implementation also treated `allowMessaging: false` as a send-only
restriction while still returning participant-visible correspondence. That did
not satisfy the documented status-only contract.

## Decision

`participantPortal` may optionally declare:

```json
{
  "enabled": true,
  "allowMessaging": true,
  "messagingCondition": {
    "fieldId": "contact_mode",
    "operator": "not_equals",
    "value": "anonymous"
  }
}
```

The condition reuses the existing bounded form-condition language.

At participant-session resolution time the engine evaluates the condition
against the ordinary answer snapshot stored on the submission version.

Messaging is enabled only when:

1. the participant portal is enabled;
2. `allowMessaging` is true; and
3. the optional messaging condition evaluates true.

If the condition evaluates false, the participant retains status access but
cannot read or send portal correspondence.

## Protected-data boundary

A messaging condition may reference only an ordinary, non-protected form field.

The engine does not decrypt protected compartments to make participant
authorization decisions.

This avoids:

- coupling participant authentication to protected-data key availability;
- turning protected values into hidden authorization dependencies;
- expanding the set of code paths permitted to decrypt protected content.

## Historical correctness

The form-version definition is immutable and the submission is pinned to that
version. The engine therefore evaluates the messaging condition using the
policy and ordinary answer snapshot that applied to that submission, rather
than the application's current form definition.

## Status-only semantics

A status-only participant:

- may authenticate with the participant credential;
- may see the bounded participant-safe status surface;
- receives no portal correspondence from the message-list service;
- cannot create a portal message;
- cannot reply to an existing portal thread.

Staff-side correspondence records are not automatically deleted or rewritten;
they are simply outside the external participant's authorized surface.

## Scope

This is a generic policy primitive.

It does not add:

- domain-specific identity modes;
- notification email/SMS delivery;
- protected-field authorization conditions;
- document attachments;
- classified handling.
