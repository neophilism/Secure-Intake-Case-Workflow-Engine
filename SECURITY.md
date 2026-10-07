# Security Policy

## Supported code

Security fixes are made on the current `main` branch. Downstream applications
should track a current engine release rather than carrying independent copies of
security-sensitive core code.

## Reporting a vulnerability

Do not open a public issue containing an unpatched vulnerability, credential,
exploit transcript, private data, or sensitive deployment detail.

Prefer GitHub's private vulnerability reporting / Security Advisory workflow
for this repository when available. Include:

- affected commit/version;
- affected route or subsystem;
- reproduction steps;
- expected and observed behavior;
- realistic impact;
- any proposed mitigation.

Do not include real production credentials or personal data in a report.

## Deployment responsibility

This repository provides reusable application-layer controls. Operators remain
responsible for TLS termination, secrets management, network segmentation,
egress controls, database hardening, backups, monitoring, malware scanning,
identity-provider policy, and incident response.

The project is not an accredited system for classified information.


## External participant credentials

Participant portal access uses two independent values: a non-secret tracking code and a separate high-entropy secret.

The raw access secret is displayed only to the participant in the immediate successful submission response. It must not be logged, copied into audit metadata, placed in URLs, or stored in downstream configuration.

The database stores only SHA-256 hashes of participant access secrets and participant session tokens. Participant pages are private/no-store and participant session cookies are HttpOnly, SameSite=Strict, and Secure in production.

Operators should treat loss of a participant access secret as a credential-loss event. The current engine does not claim identity-proofed recovery.
