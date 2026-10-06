# ADR 0015: Durable notifications and background processing

## Status
Accepted for PR 12.

## Decision

The engine uses PostgreSQL as its default durable background-job queue.

This keeps the core deployable with the database it already requires and avoids forcing Redis or another broker into every downstream statutory application. Deployments may later replace or bridge the worker boundary without changing the domain services.

## Job model

Each job is organization-scoped and records:

- stable job type;
- bounded JSON payload;
- priority;
- optional deduplication key;
- available time;
- attempts and maximum attempts;
- worker lease owner and expiration;
- last error;
- terminal completion time.

Payloads are limited to 64 KiB and should contain identifiers/configuration, not document bodies, credentials, or secrets.

## Leasing

Workers claim jobs by changing them from pending (or lease-expired running) to running and recording:

- worker ID;
- lock time;
- lease expiration;
- incremented attempt number.

Only the worker that owns the lease may complete or fail the job.

If a worker dies, the expired lease makes the job reclaimable.

## Retry and dead-letter behavior

Failures use capped exponential backoff.

After the configured maximum attempts, the job becomes `dead`.

Authorized administrators may retry a dead job. Manual retry extends the attempt budget while preserving prior attempt history rather than renumbering history.

## Attempt history

Every claimed attempt receives a durable history row.

If a running lease expires, its open attempt is closed as `lease_expired` before the next attempt begins.

## Recurring schedules

Schedules are organization-scoped interval schedules.

A due schedule enqueues one deduplicated job and advances directly to the next future interval. Missed periods are not replayed one by one after downtime.

The built-in schedule is:

```text
deadline-sweep -> deadline.sweep
```

Its interval is configured with `BACKGROUND_DEADLINE_SWEEP_SECONDS`.

## Worker scopes

The standalone worker may process jobs across all organizations.

Interactive administrator controls are explicitly tenant-scoped and may only advance schedules or claim jobs for the administrator's active organization.

## Handler registry

Workers claim only job types present in their handler registry.

The bundled core worker registers `deadline.sweep`.

Email, webhook, and automated correspondence delivery are intentionally not registered unless a deployment supplies transport adapters. Unsupported jobs stay pending; they are not falsely failed merely because credentials/providers are absent.

## Correspondence delivery

Queuing outbound correspondence creates a `correspondence.deliver` job in the same transaction.

The retry-aware handler calls the PR 11 provider-neutral communication transport with the correspondence message ID as its idempotency key.

Transient failures leave the correspondence queued while the job retries. Only the final failed attempt moves the correspondence business record to `failed`.

A stale job encountered after staff manually record the message as sent is an idempotent no-op.

## Notifications

Notifications are organization-membership scoped and support:

- `in_app`
- `email`
- `webhook`

In-app delivery is available without external infrastructure.

Email and webhook are off by default and create durable delivery intents/jobs only when enabled.

Ordinary users may opt into email at their authenticated account address. Arbitrary email destinations and webhook configuration require `notification:manage`.

Webhook destinations must use HTTPS.

## Notification transports

PR 12 defines a provider-neutral `NotificationTransport` for email and webhook delivery.

Notification delivery IDs are stable idempotency keys.

A deployment that supplies transports can register the notification job handler beside the core handlers. No vendor is hard-coded.

## Event sources

PR 12 emits notifications from:

- manual case assignment;
- automatic routing assignment;
- case escalation;
- deadline warning;
- deadline overdue;
- terminal correspondence delivery failure.

Events are created transactionally with the underlying domain change where practical.

## Audit and privacy

Notification preference changes and notification creation are auditable.

Audit metadata does not include notification bodies, recipient email addresses, webhook URLs, or delivery destinations.

The job queue stores only small structured payloads and identifiers.

## Operations

The user inbox/preferences surface is:

```text
/notifications
```

The protected job/schedule operations dashboard is:

```text
/admin/jobs
```

CLI worker commands:

```bash
npm run jobs:seed-schedules
npm run worker
npm run worker:once
```
