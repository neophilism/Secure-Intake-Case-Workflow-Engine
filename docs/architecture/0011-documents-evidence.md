# ADR 0011: Document and evidence subsystem

## Status
Accepted for PR 8.

## Decision

A logical document and its binary content versions are separate resources.

A `document` carries durable metadata such as type, title, description, and visibility. Each `document_version` is immutable content with its own filename, MIME type, byte size, SHA-256 hash, storage location, malware-scan state, uploader, and upload timestamp.

Cases and submissions link to a specific document version, never implicitly to "latest content." Replacing or revising a logical document therefore cannot silently change the evidence already attached to a case.

## Storage

Binary storage is provider-neutral behind `DocumentStorageAdapter`.

PR 8 ships a working local-filesystem adapter for development and persistent-volume deployments. Production deployments may replace this with an object-storage adapter without changing document domain records.

The configured storage driver and opaque storage key are persisted with every version.

The default local path is configurable with:

```text
DOCUMENT_STORAGE_DRIVER=local
DOCUMENT_STORAGE_ROOT=.data/documents
DOCUMENT_MAX_BYTES=26214400
```

Local ephemeral storage must not be treated as durable production storage unless the path is backed by a persistent volume.

## Integrity

SHA-256 is computed before metadata persistence.

Downloads:

1. require tenant scope and document visibility authorization;
2. require content status `available`;
3. require malware scan status `clean`;
4. read the exact stored object;
5. recompute SHA-256;
6. fail if the stored bytes do not match the persisted hash;
7. record a download access event.

PR 8 does not attempt to become the separate Evidence Integrity Engine. It exposes stable hashes, immutable versions, custody events, and access events so stronger chain-of-custody/provenance systems can integrate later.

## Malware quarantine

New uploads always begin:

```text
content_status = quarantined
malware_scan_status = pending
```

There is deliberately no built-in scanner that marks content clean by assumption.

A `MalwareScanner` adapter contract is provided. Until a production scanner is connected, authorized staff can record an external scan result with provider metadata.

- `clean` -> content becomes `available`
- `infected` -> content becomes `blocked`
- `failed` or `pending` -> content remains `quarantined`

## Workflow guards

Workflow required-document guards are now evaluated from trusted case evidence in the database.

A linked version counts only when:

- the document and document type are active;
- the content version is attached to the case;
- content status is `available`;
- malware scan status is `clean`;
- the version has its immutable SHA-256 metadata.

The client can no longer supply the document-type list used to satisfy workflow guards.

## Visibility

Document visibility values are:

- `participant`
- `internal`
- `restricted`

`restricted` content requires `document:view_private`. Other staff-visible content requires `document:view`.

## Custody and access history

Custody events record action, prior/new custodian, location, note, actor, and occurrence time.

Access events record upload, scan result, download, and related metadata. PR 9 will project important document activity into the platform-wide immutable audit envelope.

## Intake attachments

The data model and service layer support submission-linked document versions, including a form-field identifier. The PR 8 staff case UI focuses on case evidence. Public browser intake attachment transport can later call the same submission document service once the desired anonymous upload/anti-abuse deployment policy is selected.
