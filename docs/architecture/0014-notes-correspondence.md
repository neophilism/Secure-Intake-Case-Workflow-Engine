# ADR 0014: Notes, correspondence, and communication boundaries

## Status
Accepted for PR 11.

## Decision

Case annotations and correspondence are separate domain resources.

A case note is an annotation attached to a case. Correspondence is a threaded inbound/outbound communication with recipients, delivery state, reply linkage, templates, and optional document-version attachments.

## Visibility

Both notes and correspondence use:

- `internal`
- `case_participants`
- `public`

Visibility is explicit on each record.

Case access alone does not imply access to internal communication records. The application requires separate note/correspondence permissions.

## Notes

Notes are append-oriented records with author, visibility, body, status, and optional links to existing case document versions.

External-visible notes may only attach participant-visible document versions that are clean and available.

## Correspondence

Messages record:

- case and thread
- inbound/outbound direction
- channel
- visibility
- delivery status
- subject/body
- sender address
- structured to/cc/bcc recipients
- optional external message ID
- optional reply-to message ID
- optional template
- queued/sent/received timestamps
- provider/delivery metadata
- failure state
- existing case document-version attachments

Reply linkage is application-validated to remain within the same tenant, case, and thread.

## Channels

PR 11 models:

- `email`
- `letter`
- `portal`
- `manual`

The engine does not hard-code an email vendor.

## Templates

Organization templates use a deliberately small deterministic placeholder language:

```text
{{case_number}}
{{case_title}}
{{case_status}}
{{case_type}}
```

Unknown placeholders are rejected. Templates do not execute code or arbitrary expressions.

## Attachment safety

Correspondence attachments must:

1. already be linked to the case;
2. reference an immutable document version;
3. be malware-scan clean;
4. be content-status available.

For `case_participants` or `public` communication, the underlying document must be participant-visible.

This prevents an internal/restricted document from being exposed merely by selecting it in a message.

## Delivery boundary

Outbound messages begin as drafts and may be queued.

PR 11 defines a provider-neutral `CommunicationTransport` interface. A transport receives:

- a stable idempotency key equal to the message ID;
- channel;
- sender;
- recipients;
- subject/body;
- immutable attachment references and hashes.

There is no implicit default transport.

A deployment may invoke `deliverQueuedCorrespondence` with a configured adapter. PR 12 background-job infrastructure can claim/retry queued messages using the same service boundary.

Transport implementations are expected to honor the message ID as an idempotency key because an external send may succeed even if the subsequent local state update fails.

## Manual delivery recording

Authorized staff can record a queued message as externally sent. This supports letters, manual portals, or external email systems before a provider adapter is installed.

## Inbound correspondence

Inbound messages may be manually recorded now and may later be ingested by connectors.

An external message ID is treated idempotently within an organization: an already-recorded message is returned rather than duplicated, unless the identifier conflicts with another case.

## Audit minimization

Immutable audit events record communication resource IDs, status, direction, channel, visibility, recipient count, body length, attachment count, thread ID, template ID, and provider metadata where useful.

Audit events do not copy:

- message bodies;
- recipient addresses;
- sender addresses;
- attachments.

The communication tables remain the authoritative content store.

## Unified timeline

PR 11 adds a case timeline view combining:

- workflow status history;
- assignment history;
- deadline history;
- case document attachments;
- notes;
- correspondence.

The timeline is a presentation aggregation over existing domain records; it does not create a second mutable source of truth.
