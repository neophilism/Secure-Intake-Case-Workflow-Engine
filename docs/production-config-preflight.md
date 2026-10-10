# Production configuration preflight

The generic engine already has a documented Render preview and a dedicated Neon project. Use those **existing** destinations rather than creating another database or Render service.

Before applying migrations or accepting real sensitive submissions, supply the deployment settings in the provider's secret manager and run:

```sh
node scripts/verify-production-environment.mjs
```

The command is read-only. It checks the presence and **syntax** of required Neon/Render/S3/scanner configuration and that configured protected-data/webhook keys use the expected 64-character hexadecimal encoding. It prints only symbolic check names and does not emit database passwords, scanner tokens, encryption keys or object storage credentials. It rejects insecure plain-HTTP storage/scanner endpoints and PostgreSQL URLs missing explicit TLS requirements.

Missing encryption keys produce warnings only if the corresponding optional feature has not been enabled; using those features without a key remains unsupported. Operators must preserve encryption keys needed to read existing records and implement approved rotation/backup procedures.

**This is not a readiness certificate.** It does not test database access, migrations, malware detection, job workers, durable storage behavior, key custody, identity policy, cross-tenant isolation or backup restorability. Separate acceptance tests and infrastructure review are mandatory before handling real submissions. The public `/api/ready` only proves PostgreSQL reachability, not whole-system availability.

To run the regression checks without contacting external infrastructure:

```sh
node scripts/test-production-environment.mjs
```
