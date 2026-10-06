# Public Integrity Demonstration Office

This directory is the end-to-end reference application for the Secure Intake &
Case Workflow Engine.

It is intentionally fictional. It is not a real government office, and the
sample data is synthetic.

## Purpose

The reference application proves that a domain-specific case system can be
assembled as a thin layer over the reusable engine.

The application behavior lives in:

```text
application-manifest.json
```

There is no Public Integrity-specific runtime module, database table, API route,
or case-service implementation.

The companion `seed.ts` file is demonstration/setup tooling. It uses the same
generic engine services that a normal deployment uses.

## Demonstrated lifecycle

The seeded scenario exercises:

```text
citizen complaint
  -> intake screening
  -> assignment
  -> investigation
  -> information request
  -> supervisor review
  -> initial decision
  -> appeal
  -> appeal decision/effect
  -> closure
```

Along the way it exercises:

- public form validation and submission;
- form-to-workflow binding;
- configurable terminology/branding;
- application-specific roles built from core permissions;
- manual and round-robin assignment;
- routing rules;
- internal notes;
- participant-facing correspondence;
- workflow transitions and guards;
- statutory-style deadline policies;
- supervisory decision/disposition;
- independent review/appeal;
- explicit review effect on a case;
- immutable audit generation through the underlying services.

## Validate the portable application

No database is required:

```bash
npm run reference:validate
```

## Seed the synthetic scenario

Use a disposable/local database that has already been migrated.

The seeder refuses to run when `NODE_ENV=production`.

Set:

```bash
export DATABASE_URL=postgres://...
export REFERENCE_APP_PASSWORD='a-development-only-password'
```

Then run:

```bash
npm run reference:seed
```

The script creates or refreshes these synthetic users:

```text
admin@public-integrity-demo.invalid
intake@public-integrity-demo.invalid
investigator@public-integrity-demo.invalid
supervisor@public-integrity-demo.invalid
appeals@public-integrity-demo.invalid
```

All use the supplied `REFERENCE_APP_PASSWORD`.

The public complaint itself uses a reserved `.invalid` email address. Nothing
in this scenario should be treated as real personal information.

Each seed run creates a new complaint/matter so repeated runs can also exercise
search, queues, dashboards, audit history, and reporting over multiple records.

## Thin-app boundary

Deployment-local facts remain outside the manifest:

- staff identities;
- passwords and secrets;
- team membership;
- provider credentials;
- storage credentials;
- infrastructure configuration.

That division is intentional. The bill/domain package declares policy and
workflow; the deployment supplies people, credentials, providers, and runtime
infrastructure.
