# Downstream application contract

The Secure Intake & Case Workflow Engine is an upstream, domain-neutral engine.
Legislation-specific, program-specific, agency-specific, or organization-specific
applications belong in separate repositories.

## Repository boundary

The upstream engine owns reusable behavior:

- authentication and organization tenancy;
- role/permission primitives;
- intake/form processing;
- case lifecycle and workflow execution;
- routing and assignment;
- documents and evidence metadata;
- immutable audit events;
- deadlines and escalation;
- notes and correspondence;
- notifications/background jobs;
- reviews and appeals;
- disclosure/public-private separation;
- search and operational dashboards;
- API/webhooks;
- manifest parsing/reconciliation;
- security and accessibility baselines.

A downstream repository owns its application policy:

- application name and branding;
- terminology;
- application-specific roles composed from core permissions;
- form schemas;
- workflow states/transitions;
- deadlines;
- teams/queues and routing rules;
- document types;
- communication templates;
- review policies;
- deployment configuration;
- genuinely specialized code that cannot be expressed by the reusable engine.

Do not add downstream names, statutory terms, workflow branches, or special-case
conditionals to the engine solely to serve one application.

## Consumption model

The supported 1.0 distribution unit is the versioned container image published
to GitHub Container Registry:

```text
ghcr.io/neophilism/secure-intake-case-workflow-engine:<version>
```

Downstream deployments should pin an explicit release tag or immutable digest.
Do not deploy from a moving branch, copy the upstream source tree into the
downstream repository, or maintain a long-lived application fork when the
manifest/configuration boundary is sufficient.

The downstream repository should keep its manifest under source control and
apply it through the engine's manifest interface during deployment.

A minimal downstream repository can contain:

```text
application/
  manifest.json
deployment/
  compose.yaml
  env.example
docs/
README.md
```

Additional application code should be added only when configuration cannot
express the required behavior.

## Engine upgrades

For an engine upgrade:

1. select and pin the target engine release;
2. review the engine release notes and migration requirements;
3. back up the downstream database;
4. run engine database migrations;
5. validate the downstream manifest against the new engine;
6. apply the manifest;
7. run downstream acceptance/security/accessibility tests;
8. deploy the new pinned image.

Manifest reconciliation is non-destructive. Removing a previously managed
resource from a manifest does not itself delete that resource.

## Upstream feedback loop

When a downstream application reveals a missing capability:

1. determine whether the need is genuinely reusable;
2. if reusable, implement it here using neutral names and generic contracts;
3. release a new engine version;
4. update the downstream repository to the new pinned version;
5. keep application-specific policy in the downstream repository.

This is the intended development loop:

```text
generic engine
-> thin downstream application
-> discover reusable gap
-> improve generic engine
-> release
-> update downstream
```

## Compatibility contract

For the 1.0 release line:

- `schemaVersion: 1` is the portable manifest contract;
- database changes are delivered only through ordered migrations;
- existing stored form/workflow versions remain historical records;
- material public/API contracts should not be broken in a patch release;
- incompatible manifest/API changes require an explicit versioned contract;
- release tags and container tags match `package.json` version exactly.

The engine repository may contain neutral fixtures used to test these contracts,
but not a real or fictional domain-specific application.
