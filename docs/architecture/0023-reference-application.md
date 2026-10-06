# ADR 0023: End-to-end reference application and 1.0 release-candidate boundary

## Status

Accepted for PR 20.

## Decision

The first release-candidate proof is a fictional **Public Integrity
Demonstration Office** implemented as a thin application.

Its domain behavior is configuration, not upstream engine code.

The reusable engine must not gain Public-Integrity-specific tables, services,
permissions, API routes, or branching logic to make the example work.

## Portable layer

The reference application's portable policy layer is one versioned application
manifest declaring:

- branding and terminology;
- custom roles composed only from core permissions;
- document types;
- deadline calendar;
- teams and queues;
- communication templates;
- workflow states/transitions/deadlines;
- public intake form;
- routing rules;
- appeal policy.

That manifest is processed by the same parser and reconciler available to every
downstream application.

## Demonstration tooling

`examples/reference-app/seed.ts` is intentionally not runtime application
code.

It provisions synthetic deployment-local staff and drives the normal public and
staff services in sequence to demonstrate a complete matter.

It does not create a separate service abstraction or bypass the engine's
ordinary workflow/review/correspondence methods.

The seeder is disabled in production and requires an explicit development-only
password.

## Demonstrated path

The reference scenario proves:

```text
public complaint
-> case creation
-> intake screening
-> manual intake assignment
-> acceptance
-> rule-based round-robin investigator assignment
-> internal investigation note
-> information-request transition
-> outbound participant correspondence
-> inbound participant response
-> investigation completion
-> supervisory queue/assignment
-> written disposition
-> initial decision
-> decision notice
-> appeal filing
-> independent reviewer assignment
-> appeal review/decision
-> explicit appeal effect on workflow
-> final closure
```

Material operations continue to produce the ordinary immutable audit events,
notifications, histories, deadlines, and timeline records implemented by the
engine.

## Synthetic-data requirement

The bundled example must not contain real people, real complainants, real
government cases, or routable staff email addresses.

Staff and sample-contact email values use the reserved `.invalid` domain.

## 1.0 release-candidate interpretation

Passing PR 20 means the engine has demonstrated the intended architectural
shape from intake through closure and review.

It does **not** mean every downstream deployment is production-ready without
additional work.

A real deployment remains responsible for its policy correctness, threat model,
identity provider/MFA choice, infrastructure controls, provider adapters,
accessibility review, operational procedures, legal review, records-management
requirements, and any required security authorization/accreditation.

The package version becomes `1.0.0-rc.1` rather than `1.0.0` to make that
distinction explicit.
