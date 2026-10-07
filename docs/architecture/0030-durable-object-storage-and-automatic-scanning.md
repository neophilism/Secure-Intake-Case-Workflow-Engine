# ADR 0030: Durable object storage and automatic malware scanning

## Status

Accepted for PR 28.

## Context

The document subsystem already enforces quarantine, immutable version metadata,
SHA-256 provenance, trusted-download integrity checks, and an explicit malware
scan status. Public uploads also enqueue no implicit trust decision.

The remaining production gaps were deployment-critical:

- the only storage adapter was the local filesystem, which makes cloud
  deployments depend on a durable shared disk;
- the malware scanner interface had no production adapter;
- uploaded versions did not automatically enter a scanner work queue.

A production deployment must be able to use durable object storage and a real
scanner without weakening the rule that upload success never means clean.

## Decision

### S3-compatible document storage

The engine supports `DOCUMENT_STORAGE_DRIVER=s3`.

Configuration:

- `DOCUMENT_S3_ENDPOINT`
- `DOCUMENT_S3_REGION`
- `DOCUMENT_S3_BUCKET`
- `DOCUMENT_S3_ACCESS_KEY_ID`
- `DOCUMENT_S3_SECRET_ACCESS_KEY`
- optional `DOCUMENT_S3_SESSION_TOKEN`

The adapter:

- requires HTTPS;
- signs requests with AWS Signature Version 4;
- uses engine-generated object keys only;
- supports put/get/delete;
- does not expose presigned public download URLs;
- preserves the existing trusted-download SHA-256 verification.

The implementation intentionally uses Node's built-in crypto/fetch APIs and
does not add an SDK dependency.

### HTTP malware scanner adapter

When `MALWARE_SCANNER_URL` is configured, the engine POSTs raw document bytes
to the configured HTTPS scanner endpoint.

Request metadata includes:

- content type;
- encoded filename;
- expected SHA-256;
- optional bearer token.

The scanner must return JSON:

```json
{
  "status": "clean | infected | failed",
  "details": {}
}
```

Provider naming and timeout are configurable through:

- `MALWARE_SCANNER_PROVIDER`
- `MALWARE_SCANNER_TOKEN`
- `MALWARE_SCANNER_TIMEOUT_MS`

No scanner URL means no implicit clean scanner. Content remains quarantined.

### Automatic scan jobs

Every newly persisted document version enqueues a deduplicated
`document.scan` background job.

This applies to:

- staff case uploads;
- staff submission uploads;
- additional document versions;
- public intake uploads.

The job:

1. loads the document version in the tenant scope;
2. ignores versions already clean or infected;
3. requires a configured scanner;
4. reads bytes from the configured storage driver;
5. recomputes SHA-256 before scanning;
6. calls the scanner;
7. records clean/infected/failed through the existing document service.

Scanner or storage failures retry through the generic job engine. On the final
attempt, the version is recorded as failed and remains quarantined.

A SHA-256 mismatch is immediately recorded as failed.

### Evidence promotion

The existing rule remains unchanged:

- only a recorded `clean` result makes content available;
- clean intake attachments may be promoted into the source case evidence set;
- infected content is blocked;
- failed/pending content remains quarantined.

## Security considerations

Object-store credentials and scanner bearer tokens are deployment secrets.

The engine does not claim that every S3-compatible provider or scanner is
appropriate for a particular regulatory environment. The deployment authority
must select and configure approved services, network controls, retention,
encryption, backup, and logging.

The scanner endpoint receives the uploaded document content. Deployments must
treat that data transfer as part of the system's information-handling boundary.

## Scope

This PR adds generic adapters and automatic orchestration. It does not:

- provision an object-store account;
- provision an antivirus vendor;
- certify scanner efficacy;
- implement content-disarm-and-reconstruction;
- create a classified-information channel;
- make failed scans usable evidence.
