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

Binary attachment storage is intentionally not implemented by the generic PR 4 renderer. File fields represent document references and are completed by the later document/evidence subsystem.

## Verification

```bash
npm run typecheck
npm run test
npm run build
```

## Pull request rule
Each milestone is delivered through a focused pull request. Core abstractions must remain reusable and must not encode one bill's terminology or workflow.
