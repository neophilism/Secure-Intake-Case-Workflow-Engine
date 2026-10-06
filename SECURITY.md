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
