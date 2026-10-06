# ADR 0019: Versioned API and signed webhooks

## Status

Accepted for PR 16.

## API clients

Machine access uses organization-scoped API clients rather than browser sessions.

API credentials have the form:

```text
sicwe_<public-prefix>_<high-entropy-secret>
```

Only the SHA-256 hash of the complete credential is stored. The secret is returned once when the client is created.

Each client has an explicit permission set drawn from core permissions. Integration-management permissions (`api:manage` and `webhook:manage`) are non-delegable to API clients, preventing a service credential from minting or reconfiguring integration credentials.

Credentials can be revoked or expire. The organization must remain active.

## Rate limiting

Each API client has a fixed per-minute request budget.

The count is updated atomically on the API-client row, so multiple application processes share the same limit. Responses expose limit, remaining, and reset headers.

## API v1

The first public integration surface is read-only:

- case search and case detail;
- case deadlines;
- case reviews;
- visible case document metadata;
- individual visible document-version metadata;
- intake forms;
- intake submissions;
- immutable audit events.

Routes live beneath `/api/v1`.

OpenAPI 3.1 documentation is available at:

```text
/api/v1/openapi
```

Offset pagination is bounded. Case filters reuse the tenant-scoped operational search introduced in PR 15.

Service credentials cannot use the staff-only `mine` operational focus because they are not organization memberships.

## Information boundaries

Every API request derives tenant scope from the API-client database record, never from request input.

Resource access additionally requires the same permission names used by the staff application.

Document results apply the existing information-classification policy. A client with `document:view` does not receive restricted document metadata unless it also has `document:view_private`.

The API does not currently expose arbitrary document binary download. That is intentionally deferred until service-principal access events have a first-class actor model.

## Webhook source of truth

Outbound webhooks fan out from immutable `audit_events`.

A PostgreSQL trigger creates one durable webhook-delivery outbox record per matching active subscription and enqueues a `webhook.deliver` background job in the same transaction.

Existing audit events are not backfilled when a subscription is created.

Delivery lifecycle events are not themselves re-fanned-out, preventing recursive webhook loops.

## Subscription matching

Subscriptions list exact audit action names, or `*` for all audit actions.

Webhook management requires the human-session permission:

```text
webhook:manage
```

API client management requires:

```text
api:manage
```

Existing installations must synchronize default roles after migration.

## Signing secrets

Webhook signing secrets are supplied by the administrator and must contain 32-256 characters.

Secrets are encrypted at rest with AES-256-GCM using `WEBHOOK_ENCRYPTION_KEY`, a 32-byte deployment key encoded as 64 hexadecimal characters.

Changing that deployment key without re-creating or migrating existing subscriptions will make existing ciphertext undecryptable.

## Delivery and verification

The exact JSON body is signed with:

```text
HMAC-SHA256(secret, "<unix-timestamp>.<body>")
```

Headers include:

```text
X-SICWE-Delivery
X-SICWE-Event
X-SICWE-Timestamp
X-SICWE-Signature: sha256=<hex>
```

Consumers should verify the signature against the raw body, enforce a timestamp tolerance, and deduplicate on delivery ID.

## Retry model

Webhook delivery uses the existing durable background-job engine:

- worker leasing;
- lease renewal;
- capped retry backoff;
- attempt history;
- dead-letter handling.

The webhook delivery row separately records delivery status, HTTP status, attempt count, terminal error, and delivery time.

## Network safety

Webhook endpoints must:

- use HTTPS;
- use the standard HTTPS port;
- contain no URL credentials;
- not use localhost/local/internal hostnames;
- not be private IP literals.

DNS is resolved at subscription creation and again immediately before each delivery. Any private/local resolved address blocks delivery. Redirects are disabled.

Deployments should still enforce outbound network policy/firewall controls as defense in depth against DNS rebinding and future parser/network-stack vulnerabilities.

## Security boundary

This integration layer does not make the engine suitable for classified information.

API keys, the webhook encryption key, and receiving-system signing secrets must be treated as production secrets and managed outside source control.
