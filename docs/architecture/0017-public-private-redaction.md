# ADR 0017: Public/private separation, redaction, and disclosure publication

## Status
Accepted for PR 14.

## Decision

Information classification and anonymous publication are separate concepts.

The canonical classifications are:

```text
PUBLIC
PARTICIPANT
INTERNAL
RESTRICTED
```

Stored values are lowercase.

`PUBLIC` means a record may be suitable for public use. It does **not** mean the source record is anonymously exposed.

Anonymous access is possible only through an explicitly approved disclosure publication version.

## Legacy normalization

The former communication value `case_participants` is normalized to `participant`.

Migration 0012 updates existing note/template/correspondence values and changes new communication defaults.

Parsing remains backward compatible with `case_participants` so imported legacy data cannot accidentally bypass classification checks.

## Publication boundary

A disclosure publication is a stable public slug associated internally with exactly one source record:

- case;
- submission;
- document;
- note;
- correspondence;
- review.

The source ID is never required by the anonymous route.

A publication has immutable content versions.

Every version contains only:

- public title;
- optional public summary;
- bounded public-safe JSON;
- an internal redaction summary;
- optional explicitly linked public redacted document derivatives.

The public route returns the public title, summary, public JSON, publication timestamp, publisher organization name, and approved linked derivatives. It does not return source IDs, review notes, redaction notes, internal status history, or other source fields.

## Source authorization

`disclosure:prepare` does not grant source visibility.

Preparation also requires the normal source permission:

- case -> `case:view`
- submission -> `submission:view`
- document -> document visibility policy, including `document:view_private` for restricted content
- note -> `case:view` + `note:view`
- correspondence -> `case:view` + `correspondence:view`
- review -> `case:view` + `review:view`

The same rule applies when creating a redacted derivative from a source document.

## Immutable revisions

Publication representation content is immutable after insert.

PostgreSQL rejects updates to:

- publication/version identity;
- version number;
- public title;
- public summary;
- public JSON;
- redaction summary;
- preparer.

Corrections create a new revision.

This keeps a stable record of exactly what was submitted, approved, rejected, or published.

## Four-eyes disclosure review

The lifecycle is:

```text
draft -> submitted -> approved -> published -> superseded
                   \-> rejected
```

A reviewer cannot be the preparer.

The service enforces this rule and migration 0012 adds a database check constraint.

Approval and publication are separate permissions:

- `disclosure:prepare`
- `disclosure:review`
- `disclosure:publish`

A currently published version remains live while a replacement revision is prepared/reviewed. Publishing the new approved version atomically supersedes the prior published version.

Only one version of a publication may have status `published` at a time.

## Withdrawal

A publication can be withdrawn without deleting historical versions.

The publication records:

- withdrawal time;
- withdrawing user;
- internal withdrawal reason.

A withdrawn publication immediately disappears from anonymous reads because the public query requires both publication status and version status to be published.

Republishing requires a new approved revision.

## Public-safe JSON

Public JSON must have an object root and is bounded by:

- maximum nesting depth;
- object key count;
- array length;
- string length;
- 64 KiB serialized size.

Prototype-sensitive keys are rejected.

The review process remains the substantive disclosure safeguard: structural validation cannot determine whether information is legally releasable.

## Redacted document derivatives

Redaction never mutates the source document/version.

A derivative records:

- source immutable document version;
- new immutable derivative document version;
- audience (`public` or `participant`);
- internal redaction summary;
- creator/time.

The derived document carries the same audience as its classification.

Database triggers ensure source/output tenant consistency and audience/classification consistency.

A public disclosure version can link only `public` derivatives and only while the disclosure version is draft.

Before approval and again before publication, every linked derivative must be:

- audience `public`;
- document visibility `public`;
- active;
- content status `available`;
- malware scan status `clean`;
- backed by a valid SHA-256 hash.

## Storage and download

Public derivatives use the same immutable document-storage abstraction as private evidence.

Anonymous download verifies the stored SHA-256 hash before returning bytes.

The anonymous lookup begins from a published disclosure/version and follows only explicit public derivative links. It never performs a direct anonymous lookup of an arbitrary document version.

Public downloads create document-access events with no user actor and with publication/derivative provenance.

## Public route

Published disclosures are available at:

```text
/public/disclosures/<organization-slug>/<publication-slug>
```

Linked documents are served only through the publication-scoped route.

## Audit

Audit events record publication state changes, IDs, counts, public JSON keys/size, and redaction-presence flags.

Audit metadata deliberately does not copy public draft content, source text, redaction text, or review notes.

## Security note

This disclosure layer is a release-control mechanism, not an automatic legal redaction engine.

It does not decide whether FOIA/privacy/statutory exemptions apply. Deployments must configure authorized human disclosure review appropriate to their governing law and policy.
