# ADR 0020: Declarative thin applications and white-label profiles

## Status

Accepted for PR 17.

## Decision

Bill-specific and domain-specific applications should be thin configuration layers over the reusable engine.

A downstream application is represented by a versioned JSON manifest with:

- application identity and branding;
- terminology overrides;
- custom roles and core permissions;
- document types;
- deadline calendars;
- routing teams and queues;
- communication templates;
- versioned workflows and deadline policies;
- intake forms and form/workflow bindings;
- routing rules;
- review policies and prerequisite hierarchy.

The manifest is validated before reconciliation.

## Manifest ownership

A manifest does not own an organization.

It owns only the individual resources recorded in
`application_managed_resources`.

When a manifest first encounters an existing resource with the same stable key,
the apply operation fails unless that resource is already recorded as
manifest-managed.

This prevents a thin application from silently taking control of manually
configured local resources.

## Non-destructive reconciliation

Applying a manifest is intentionally non-destructive.

Resources declared by the manifest are created or updated.

Resources omitted from a later revision are **not** automatically deleted,
disabled, or superseded merely because they disappeared from configuration.

Destructive retirement requires an explicit future lifecycle operation.

This protects historical cases, submissions, workflow snapshots, document
types, routing records, and locally added configuration.

## Versioned forms and workflows

Forms and workflows keep their existing versioning semantics.

If the manifest definition is unchanged, reapplication does not create a new
published version.

If a definition changes:

1. the currently published version is superseded;
2. a new published version is created;
3. historical submissions/cases continue to point to their prior immutable
   versions/snapshots.

Parent form/workflow metadata may be updated without creating a new definition
version.

## Case types

Cases created from intake use the intake form slug as their generic
`case_type`.

The manifest therefore does not create a second case-type registry. Thin
applications define their operational case types through stable form slugs and
can route on those values.

## Cross-resource validation

Before reconciliation, the manifest validator checks references including:

- form -> workflow;
- queue -> team;
- routing rule -> queue;
- workflow deadline -> calendar;
- workflow deadline escalation -> queue;
- workflow required document -> document type;
- review policy -> calendar;
- review policy -> prerequisite policy;
- prerequisite policy hierarchy.

Round-robin queues require a declared team. Team membership remains
deployment-local because staff identities are not part of a portable
legislative/application package.

## System roles

Core system-role keys cannot be replaced by a manifest.

A manifest may declare application-specific roles using ordinary core
permissions. System role updates remain an engine concern and continue through
`auth:sync-roles`.

## Branding and terminology

The active application profile stores bounded branding and terminology values.

Branding supports:

- root-relative or HTTPS logo URL;
- six-digit hexadecimal accent color;
- public home title;
- public home description.

Terminology supports singular/plural labels for generic engine concepts such
as case, submission, submitter, review, deadline, document, and queue.

The core remains semantically neutral internally. Labels change presentation,
not database meanings or authorization behavior.

## Manifest history

Every successful apply creates an immutable manifest revision containing:

- organization;
- application key;
- canonical SHA-256 manifest hash;
- full parsed manifest JSON;
- applying user;
- apply time;
- active/superseded status.

Only one revision is active for an organization.

Reapplying the identical active manifest is an idempotent no-op.

A previously used older manifest may be applied again as a new revision,
supporting explicit rollback-by-reconciliation without rewriting history.

## Canonical hashing

Manifest and resource checksums are computed from recursively key-sorted JSON.
Array order is preserved.

Equivalent object-key ordering therefore does not produce spurious
configuration changes.

## Administration

Human configuration is available at:

```text
/admin/application
```

Permissions:

```text
application:view
application:manage
```

Administrators receive both through the core role. Supervisors and auditors
receive read access.

## CLI

Portable thin applications can ship a manifest file and use:

```bash
npm run app:manifest -- --file ./application.json --validate-only
```

Deployment reconciliation uses an active organization member with
`application:manage`:

```bash
npm run app:manifest -- \
  --file ./application.json \
  --organization example-office \
  --actor-email admin@example.gov
```

The CLI and admin screen call the same parser and reconciliation service.

## Security and scope

A manifest contains policy/application configuration, not deployment secrets.

API keys, webhook secrets, mail credentials, object-storage credentials,
classified material, staff membership, and other environment-specific secrets
must not be embedded in manifests.

The open-source engine remains unaccredited for classified information.
