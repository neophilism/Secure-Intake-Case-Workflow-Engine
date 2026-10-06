# ADR 0021: Security hardening baseline

## Status

Accepted for PR 18.

## Context

The engine now exposes several trust boundaries:

- browser sessions and Server Actions;
- cookie-authenticated route handlers;
- anonymous public intake;
- organization-scoped integration API credentials;
- outbound webhooks;
- document upload/download;
- declarative application manifests;
- background workers and external transports.

PR 18 establishes a reusable security baseline around those boundaries without
encoding any bill-specific policy.

## Authentication throttling

Local-password authentication is protected by database-backed failure buckets.

Every attempted login derives a SHA-256 account bucket from the normalized
email address. When `AUTH_TRUST_PROXY_HEADERS=true`, a second source bucket is
derived from a trusted proxy-provided client address.

No attempted email address or IP address is stored in plaintext in the throttle
table.

Default policy:

```text
AUTH_LOGIN_FAILURE_LIMIT=5
AUTH_LOGIN_WINDOW_MINUTES=15
AUTH_LOGIN_BLOCK_MINUTES=15
```

The source bucket is disabled by default because forwarding headers are
attacker-controlled unless a trusted reverse proxy overwrites them.

Successful authentication clears the account bucket only. It does not clear a
source bucket, preventing an attacker with one known credential from resetting
source-level spray protection.

Stale throttle rows are removed during failure processing and indexed by update
time so rotating identifiers cannot create permanent unbounded state.

## Account-enumeration timing

Unknown accounts and accounts without a local credential perform bcrypt work
before failure is returned.

This does not promise perfectly constant network timing, but it removes the
large deterministic difference between "user not found" and an actual bcrypt
verification.

The browser continues to receive generic credential-failure messages.

## Bcrypt input bound

bcrypt only has a finite effective password input.

New passwords are rejected above 72 UTF-8 bytes and authentication rejects
over-bound candidates after equivalent failure work. The engine does not
silently rely on bcrypt truncation.

## Session cookies

The session cookie is:

- opaque and randomly generated;
- represented in the database only by SHA-256 hash;
- `HttpOnly`;
- `SameSite=Strict`;
- `Secure` in production;
- scoped to `Path=/`;
- emitted with high browser priority.

Deployments served exclusively over HTTPS may use a `__Host-` cookie name via
`AUTH_SESSION_COOKIE_NAME`.

## Browser mutation origin

Cookie-authenticated route-handler POST operations require a browser origin or
referer whose origin exactly matches `APP_BASE_URL`.

A request marked `Sec-Fetch-Site: cross-site` is rejected immediately.

The configured `APP_BASE_URL` must therefore be the public canonical origin
and is validated as an HTTP(S) origin with no credentials, path, query, or
fragment.

Next.js Server Actions retain the framework's own origin checks. The explicit
guard in this ADR covers custom cookie-authenticated route handlers such as
document upload and API-key creation.

Bearer-authenticated `/api/v1` routes do not use cookie ambient authority and
therefore do not use the browser-mutation guard.

## Browser response headers

The engine emits a baseline policy including:

- Content-Security-Policy;
- `frame-ancestors 'none'` and `X-Frame-Options: DENY`;
- `X-Content-Type-Options: nosniff`;
- `Referrer-Policy: no-referrer`;
- restrictive `Permissions-Policy`;
- `Cross-Origin-Opener-Policy: same-origin`;
- `Cross-Origin-Resource-Policy: same-origin`;
- `X-Permitted-Cross-Domain-Policies: none`;
- HSTS on production builds.

Authenticated administrative pages are explicitly `private, no-store`.

The current Next.js runtime requires inline framework bootstrap code, so the
baseline CSP permits inline script/style execution. Deployments seeking a
stricter nonce/hash CSP may layer one at the reverse proxy after validating it
against their exact Next.js build.

## Integration API caching

Authenticated API responses, including authentication and authorization
errors, are non-cacheable.

401 responses include a Bearer `WWW-Authenticate` challenge.

API credentials remain high-entropy one-time secrets stored only as hashes.

## Webhook egress

Webhook destinations remain HTTPS-only, credential-free URLs on port 443 with
redirects disabled.

The destination is checked when the subscription is created and immediately
before delivery.

IPv4 classification rejects private, loopback, link-local, benchmarking,
documentation, multicast, reserved, and other non-public ranges.

IPv6 classification permits only ordinary global-unicast space and rejects:

- unspecified and loopback;
- ULA/link-local/multicast and other non-global ranges;
- IPv4-mapped private destinations, including hexadecimal notation;
- documentation space;
- Teredo;
- 6to4;
- benchmarking and ORCHID ranges.

DNS rebinding remains a network-layer concern because a hostname can change
between application validation and the transport's own resolution. Production
deployments must enforce outbound firewall/egress policy that prevents access
to internal networks and cloud metadata endpoints.

## Container runtime

The production Docker image runs as an unprivileged `nextjs` user rather than
root and disables framework telemetry.

## Dependency advisory gate

CI runs:

```bash
npm audit --omit=dev --audit-level=high
```

before typecheck, tests, and build.

High/critical advisories in runtime dependencies therefore fail the normal
merge gate.

## What this does not claim

This baseline does not replace:

- MFA or an external identity provider;
- reverse-proxy/WAF rate limiting and volumetric DDoS controls;
- outbound firewalling;
- a secrets manager;
- malware scanning;
- infrastructure hardening;
- penetration testing;
- formal authorization or accreditation for classified systems.

Those remain deployment responsibilities.
