# Downstream application contract

The Secure Intake & Case Workflow Engine is an upstream, domain-neutral engine.
Legislation-specific, program-specific, agency-specific, or organization-specific
applications belong in separate repositories.

## Repository boundary

The upstream engine owns reusable behavior:

- authentication and organization tenancy;
- role/permission primitives;
- intake/form processing;
- encrypted protected form compartments and dual-control reveal;
- protected external-participant status/messaging credentials;
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
- form schemas, including protected compartments and whether a form enables participant portal access;
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


## Protected-data deployment contract

Downstream forms may mark individual non-file fields with a `protection` object. The engine then removes those values from ordinary submission JSON and stores them in a separately encrypted compartment.

A downstream deployment using protected fields must supply `PROTECTED_DATA_ENCRYPTION_KEY` through deployment secrets. The key is not portable application policy and must never be placed in the application manifest.

The current 1.0 contract supports `revealPolicy: "dual_control"` only. A different authorized user must approve a reveal request, approvals expire, and the requester's reveal is one-time.

This primitive protects structured form values. It does not make the engine a classified-information system and does not extend to binary documents.


## External-participant deployment contract

A downstream form may opt into:

```json
"participantPortal": {
  "enabled": true,
  "allowMessaging": true
}
```

When enabled, final public submission issues a high-entropy secret paired with the normal non-secret confirmation/tracking code. The raw secret is shown only in the immediate submission result and is never stored server-side.

Downstream copy must tell participants to save the access secret. A confirmation code by itself is not authentication.

The portal exposes only the generic bounded status/message surface. A downstream application must not rely on it to expose internal case fields, protected form data, arbitrary documents, or classified information.

`allowMessaging: false` provides status-only access.

Participant portal sessions are configured through deployment environment variables, not through the application manifest.


### Conditional participant messaging

A downstream form may enable participant status access for every submission while restricting secure messages to selected submissions:

```json
"participantPortal": {
  "enabled": true,
  "allowMessaging": true,
  "messagingCondition": {
    "fieldId": "contact_mode",
    "operator": "not_equals",
    "value": "anonymous"
  }
}
```

The condition uses the same bounded condition language as form visibility. It may reference only an ordinary, non-protected form field. The engine evaluates the condition against the submission's immutable ordinary answer snapshot when resolving the participant session.

When the result is false, the portal is status-only:

- participant messages are not returned;
- the participant cannot send a new message or reply;
- the credential/session/status surface remains available.

Protected fields cannot control this decision because participant authorization must not require decrypting protected compartments.


## Public attachment deployment contract

A downstream public form may enable a file field by binding it to a
manifest-declared document type:

```json
{
  "id": "supporting_files",
  "type": "file",
  "acceptedMimeTypes": ["application/pdf"],
  "maxFiles": 3,
  "publicUpload": {
    "documentTypeKey": "supporting_material",
    "visibility": "internal"
  }
}
```

The binding is application policy; public clients cannot select an arbitrary
document type. Field MIME policy, when present, must be no broader than the
bound document type.

Public files are stored as immutable submission-linked document versions with
SHA-256 provenance and begin `quarantined / pending`. Only a recorded clean
malware scan may make the content available and eligible for promotion into
case evidence. A downstream deployment must connect an appropriate production
scanner or authorized scan process; absence of a scanner never causes the
engine to assume a file is clean.

The global `DOCUMENT_MAX_BYTES` setting remains a deployment ceiling in
addition to document-type policy. The default local adapter writes beneath
`/app/.data/documents` in the container image; deployments using that adapter
must mount durable storage there (and share it with any worker that operates on
documents). Production deployments may instead supply a durable storage adapter
appropriate to their environment and should apply sandbox, DLP, retention, and
infrastructure controls as required.

This public attachment primitive does not extend protected structured-data
compartments to binary files, does not enable participant-message attachments,
and does not make the engine suitable for classified information.
