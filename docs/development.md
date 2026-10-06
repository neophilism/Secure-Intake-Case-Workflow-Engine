# Development

## Prerequisites
- Node.js 22+
- Docker with Compose

## Local setup

```bash
cp .env.example .env
docker compose up -d postgres
npm install
npm run db:migrate
npm run dev
```

Open http://localhost:3000. Health check: http://localhost:3000/api/health.

## Bootstrap the first administrator

Set these environment variables locally:

```bash
export BOOTSTRAP_ADMIN_EMAIL="admin@example.gov"
export BOOTSTRAP_ADMIN_PASSWORD="use-a-long-unique-password"
export BOOTSTRAP_ORGANIZATION_NAME="Example Office"
export BOOTSTRAP_ORGANIZATION_SLUG="example-office"
```

Then run:

```bash
npm run auth:bootstrap
```

The bootstrap operation creates or reuses the organization and user, stores a bcrypt password hash, initializes the default organization roles, and assigns the administrator role. It is idempotent for the same organization/user.

## Database changes

Update `src/db/schema.ts`, then generate and review a migration:

```bash
npm run db:generate
npm run db:migrate
```

Tenant-owned tables must carry an explicit `organization_id` and application queries must obtain that value from a trusted server-side tenant scope.

## Authentication model

The session cookie contains an opaque random token. Only a SHA-256 hash of that token is stored in the database. Local passwords are bcrypt-hashed. External SSO/OIDC identities can later bind through the `auth_identities` table without changing the authorization model.

Identity alone does not establish tenant access:

```text
authenticated user
  -> active organization membership
  -> trusted tenant scope
  -> assigned roles
  -> permissions
```

## Form definitions

Intake forms are stored as versioned JSON definitions. The first implementation supports sections, common field types, validation rules, conditional visibility, attestations, and attachment references.

Use the protected `/admin/forms` screen to create a form and draft definition. Publishing a draft makes it the active public/authenticated version and supersedes the prior published version without altering historical submissions.

Public forms are rendered at:

```text
/intake/<organization-slug>/<form-slug>
```

The document/evidence subsystem supports immutable submission-linked files. The generic anonymous browser renderer still does not enable binary upload by default; deployments may connect a vetted public-upload transport to the submission attachment service.

## Case lifecycle

Staff with case access can work from the protected case console:

```text
/admin/cases
```

Submitted intake appears in the review queue for users with both `submission:view` and `case:create`. Starting review allocates a tenant/year case number and creates an `intake_review` case linked to the immutable source submission.

New cases use a versioned workflow definition. If an intake form is not bound to a custom workflow, the built-in default workflow is snapshotted into the case. If a form is bound, the currently published workflow version is snapshotted and its version ID is retained.

Manage workflows at:

```text
/admin/workflows
```

Workflow definitions support named states, keyed transitions, required permissions, required/forbidden comments, required case fields, required submission fields, required document types/counts, and safe automatic case actions.

Existing installations should synchronize newly introduced default-role permissions after migration:

```bash
npm run auth:sync-roles
```

Document guards are enforced from trusted case evidence. Only active case-linked versions that are scan-clean, available, and carry valid SHA-256 metadata count toward required-document guards.

## Assignment and routing

Operational routing is configured at:

```text
/admin/routing
```

The model separates offices, teams, queues, and individual assignments. Routing rules are evaluated in ascending priority order and the first active match wins.

Supported queue strategies:

- `manual`: assign the queue only;
- `round_robin`: select the next active, available member of the queue's team.

Creating a case immediately invokes routing. If no rule matches, the case remains unassigned. If routing fails because the target configuration is unavailable, the case remains durable and staff can correct or manually assign it.

Users with `case:assign` can manually reassign and escalate cases from the case detail page. Escalations may change queue and priority, increment the escalation level, and are recorded in assignment history.

Existing installations should synchronize the new routing permissions:

```bash
npm run auth:sync-roles
```

## Documents and evidence

Configure document storage:

```env
DOCUMENT_STORAGE_DRIVER=local
DOCUMENT_STORAGE_ROOT=.data/documents
DOCUMENT_MAX_BYTES=26214400
```

The bundled local adapter writes immutable content beneath the configured root. Use a persistent volume if this adapter is used outside local development; production object storage should implement the same `DocumentStorageAdapter` contract.

Manage stable document types at:

```text
/admin/documents
```

Case staff can upload evidence from the case detail page. Every upload starts quarantined with a pending malware-scan status. The engine intentionally has no implicit scanner that calls unknown content clean.

Authorized staff with `document:scan_manage` can record a trusted external scanner result. Only exact versions that are `available` and scan `clean` can be downloaded or satisfy workflow required-document guards.

Downloads recompute SHA-256 against the stored bytes and fail on mismatch. Custody events and access/download events are retained per immutable version.

Existing installations should synchronize the new document permissions:

```bash
npm run auth:sync-roles
```

## Immutable audit log

Material operational events are projected into the tenant-scoped append-only audit stream and can be reviewed at:

```text
/admin/audit
```

The audit viewer requires `audit:view`.

The database migration installs a trigger that rejects `UPDATE` and `DELETE` against `audit_events`. Feature-specific histories such as case status, assignment history, document custody, and document access remain in place; the audit stream provides one uniform oversight envelope across them.

Audit state is intentionally data-minimized. Do not place passwords, session/resume tokens, binary document content, malware samples, full intake answers, or other secret material in audit metadata. Use resource identifiers, statuses, hashes, version numbers, and bounded operational deltas instead.

Where the domain operation is already transactional, its audit insert occurs in the same transaction so a failed audit write rolls back the state mutation.

## Deadlines and statutory clocks

Workflow definitions may include versioned `deadlinePolicies`. A policy can start at case creation or on a named transition, use hours/calendar/business days, issue a warning before due time, permit manual pause/resume, complete on named transitions, and configure overdue escalation.

Example:

```json
{
  "key": "initial-review",
  "label": "Initial review deadline",
  "trigger": { "type": "case_created" },
  "duration": { "value": 30, "unit": "calendar_days" },
  "warningBefore": { "value": 5, "unit": "calendar_days" },
  "pausable": false,
  "completeOnTransitions": ["accept_intake", "reject_intake"],
  "escalation": { "priority": "high", "queueSlug": "supervisory-review" }
}
```

Business-day policies require `calendarKey`. Calendars are configured at:

```text
/admin/deadlines
```

Each calendar explicitly defines its IANA timezone, weekend weekdays, and excluded local dates. The engine does not assume which holidays or closures count for a deployment.

The dashboard also shows all instantiated case clocks and their warning, overdue, and escalation state.

Authorized case staff may pause, resume, complete, or cancel eligible clocks from the case detail page. Pause/resume requires a reason and is retained in deadline history and immutable audit.

Time-dependent evaluation is performed by the reusable sweep:

```bash
npm run deadline:sweep
```

The sweep processes all active organizations, issues warnings, marks clocks overdue, and applies configured priority/queue escalation through the existing case escalation service. A protected manual sweep control is also available at `/admin/deadlines`.

PR 10 deliberately does not run a permanent scheduler process. The background-job milestone can invoke this same sweep service on a recurring cadence.

Existing installations should synchronize the new deadline permissions:

```bash
npm run auth:sync-roles
```

## Verification

```bash
npm run typecheck
npm run test
npm run build
```

## Pull request rule
Each milestone is delivered through a focused pull request. Core abstractions must remain reusable and must not encode one bill's terminology or workflow.
