# ADR 0024: Protected form compartments and dual-control reveal

## Status

Accepted for PR 22.

## Context

A downstream application required some intake values to be logically and cryptographically separated from ordinary submission content.

Storing those values in the same `answers` JSON and hiding them in the user interface would not provide a meaningful compartment boundary. Separation must begin before persistence, including for resumable drafts.

The capability is useful beyond any one application: protected contact details, witness identities, sealed conflict information, protected demographic data, and other case-workflow values may require the same pattern.

## Decision

Form fields may declare a generic protection policy:

```json
{
  "protection": {
    "compartment": "identity",
    "revealPolicy": "dual_control"
  }
}
```

The only 1.0 reveal policy is `dual_control`.

After form validation, protected fields are split from the ordinary answer map. Ordinary values remain in `intake_submissions.answers`; protected values are grouped by compartment and encrypted into `submission_protected_compartments`.

This applies to:

- initial draft creation;
- draft updates;
- draft finalization;
- direct public submission.

There is no transitional state in which a protected value is intentionally stored in the ordinary answers column.

## Cryptographic boundary

Protected payloads use AES-256-GCM.

The deployment supplies:

```text
PROTECTED_DATA_ENCRYPTION_KEY
```

as a 32-byte key encoded with 64 hexadecimal characters.

Authenticated additional data binds ciphertext to:

- organization ID;
- submission ID;
- compartment key.

The service refuses to persist protected fields when the encryption key is absent. Deployments with no protected fields do not need the key.

The current release does not provide automatic key rotation. Operators must preserve the configured key while encrypted records exist and manage it through an appropriate secrets system.

## Dual-control reveal

A reveal is a stateful workflow:

```text
pending -> approved -> consumed
        \-> rejected
```

Rules:

- a request requires a bounded human reason;
- the requester cannot approve or reject their own request;
- a second authorized user decides the request;
- approval expires after 15 minutes;
- only the original requester can reveal;
- reveal is one-time and concurrency-safe;
- ordinary case pages show metadata only;
- plaintext is returned only by a same-origin-checked POST response;
- reveal responses are `private, no-store`;
- request, approval/rejection, and reveal are immutable audit events;
- plaintext is never copied into audit metadata.

## Conditional-visibility boundary

A protected field may control another field only when both are in the same compartment.

Otherwise the presence or absence of an ordinary persisted answer could leak information about a protected controller value.

## Documents

File fields cannot use this structured-value compartment primitive.

Protected binary evidence needs its own storage, malware-quarantine, key-management, and authorization contract. Rejecting protected file fields is safer than implying that protecting a document reference also protects the underlying bytes.

## Scope

This feature is a generic application privacy primitive. It does not claim:

- classified-system accreditation;
- HSM-backed production key custody;
- automatic key rotation;
- protected public binary uploads;
- external-participant status/messaging.

Those remain separate capabilities or deployment responsibilities.
