# ADR 0031: Liveness and readiness contracts

## Status

Accepted for PR 29.

## Context

Cloud schedulers and service managers need a machine-readable way to distinguish
"the application process is alive" from "the application can currently serve
database-backed requests."

The existing `/api/health` route returned a static payload with a stale
hard-coded version. It was useful as a smoke check but not an explicit
production orchestration contract.

## Decision

The engine exposes two unauthenticated, non-sensitive endpoints.

### `GET /api/health`

Liveness only.

Returns HTTP 200 when the Next.js process can serve the request. The payload
contains:

- `status: ok`;
- service identifier;
- package version;
- `check: liveness`.

It does not contact PostgreSQL or disclose tenant state.

### `GET /api/ready`

Readiness.

The route executes a minimal `select 1` against the configured PostgreSQL
connection.

- HTTP 200 / `status: ready` when the database probe succeeds;
- HTTP 503 / `status: not_ready` when `DATABASE_URL` is missing or the
  database is unavailable.

The payload exposes only the coarse database state:

- `ok`;
- `unconfigured`;
- `unavailable`.

Raw database errors, hostnames, credentials, query text and tenant data are not
returned.

Both endpoints send `Cache-Control: no-store`.

## Deployment use

Load balancers and cloud web-service health checks should use
`/api/ready` when they need to avoid routing traffic to an instance that
cannot reach its required database.

Process supervisors may use `/api/health` for a pure liveness signal.

Background workers do not expose an HTTP server and therefore remain monitored
through process health, job heartbeats, logs and SIEM.

## Security

The endpoints are intentionally unauthenticated because external health
checkers often run before application authentication.

Their responses are deliberately bounded to service/version and coarse
dependency state.

## Scope

This milestone does not add:

- deep dependency diagnostics;
- object-store/scanner reachability checks;
- tenant-specific readiness;
- authentication/provider readiness;
- worker HTTP health endpoints.
